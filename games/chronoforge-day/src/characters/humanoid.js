import * as THREE from 'three';

/** All measurements are metres. The family shares this skeleton and rest pose. */
export const HUMANOID_BONES = Object.freeze([
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
]);

export const KAIDA_PALETTE = Object.freeze({
  skin: '#d79e85', hair: '#b52a63', coat: '#185665', cloth: '#252837',
  leather: '#422d35', metal: '#718293', accent: '#b19161', blade: '#b880f7',
});

const clamp = (n, lo, hi, fallback) => Number.isFinite(n) ? THREE.MathUtils.clamp(n, lo, hi) : fallback;
const mix = THREE.MathUtils.lerp;
const color = (c, amount) => new THREE.Color(c).multiplyScalar(amount);

/** A closed cross-section loft. Rings are [y, halfWidth, frontDepth, backDepth, x?, z?]. */
function loft(rings, segments = 16) {
  const positions = [], indices = [];
  for (const [y, rx, front, back = front, cx = 0, cz = 0] of rings) {
    for (let j = 0; j < segments; j++) {
      const a = j / segments * Math.PI * 2;
      positions.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * (Math.sin(a) >= 0 ? front : back));
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let j = 0; j < segments; j++) {
      const a = r * segments + j, b = r * segments + (j + 1) % segments;
      indices.push(a, a + segments, b, b, a + segments, b + segments);
    }
  }
  // The ring winding above assumes bottom-to-top ring order.
  if (rings[0][0] > rings[rings.length - 1][0]) {
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  const start = positions.length / 3;
  positions.push(rings[0][4] || 0, rings[0][0], rings[0][5] || 0);
  positions.push(rings.at(-1)[4] || 0, rings.at(-1)[0], rings.at(-1)[5] || 0);
  const ascending = rings[0][0] < rings.at(-1)[0];
  for (let j = 0; j < segments; j++) {
    const k = (j + 1) % segments;
    indices.push(...(ascending ? [start, j, k] : [start, k, j]));
    const a = (rings.length - 1) * segments;
    indices.push(...(ascending ? [start + 1, a + k, a + j] : [start + 1, a + j, a + k]));
  }
  return geometry(positions, indices);
}

function geometry(positions, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** A shallow extruded plate; face points are counterclockwise as seen from +Z. */
function plate(points, depth = .006) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: Math.min(depth * .3, .002),
    bevelThickness: Math.min(depth * .3, .002), bevelSegments: 1, steps: 1, curveSegments: 3,
  });
}

/** Tapered, curved solid used for hair locks and tailored piping, with stable local frames. */
function sweep(points, radii, aspect = 1, segments = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const steps = Math.max(10, points.length * 4), positions = [], indices = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
    const up = Math.abs(tangent.y) < .92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const normal = new THREE.Vector3().crossVectors(side, tangent).normalize();
    const f = t * (radii.length - 1), a = Math.min(Math.floor(f), radii.length - 2), radius = mix(radii[a], radii[a + 1], f - a);
    for (let j = 0; j < segments; j++) {
      const angle = j / segments * Math.PI * 2;
      const v = p.clone().addScaledVector(side, Math.cos(angle) * radius).addScaledVector(normal, Math.sin(angle) * radius * aspect);
      positions.push(v.x, v.y, v.z);
    }
    if (i > 0) for (let j = 0; j < segments; j++) {
      const a0 = (i - 1) * segments + j, b0 = (i - 1) * segments + (j + 1) % segments;
      indices.push(a0, a0 + segments, b0, b0, a0 + segments, b0 + segments);
    }
  }
  return geometry(positions, indices);
}

export function createHumanoid(profile = {}) {
  const height = clamp(profile.height, 1.35, 2.15, 1.72), s = height / 1.72;
  const build = clamp(profile.build, .75, 1.35, 1);
  const headScale = clamp(profile.headScale, .8, 1.2, 1);
  const weaponScale = clamp(profile.weaponScale, .7, 1.35, 1);
  const palette = { ...KAIDA_PALETTE, ...profile.palette };
  const root = new THREE.Group(); root.name = 'humanoid';
  const bones = {}, meshes = [], materials = [], geometries = new Set();
  const limbWidth = .8 + .2 * build;
  const metrics = {
    height, hipHeight: .935 * s, upperLeg: .425 * s, lowerLeg: .410 * s,
    footHeight: .100 * s, upperArm: .275 * s, forearm: .255 * s,
    shoulderWidth: .422 * s * build,
  };

  const makeMaterial = (name, properties) => {
    const m = new THREE.MeshStandardMaterial({ roughness: .73, metalness: 0, ...properties });
    m.name = name; materials.push(m); return m;
  };
  const mat = {
    skin: makeMaterial('warm skin', { color: palette.skin, roughness: .72 }),
    skinShade: makeMaterial('lip and ear warmth', { color: color(palette.skin, .77) }),
    hair: makeMaterial('magenta hair', { color: palette.hair, roughness: .48 }),
    hairDark: makeMaterial('hair roots', { color: color(palette.hair, .42), roughness: .62 }),
    hairLight: makeMaterial('hair ridges', { color: new THREE.Color(palette.hair).lerp(new THREE.Color('#ef83af'), .35), roughness: .5 }),
    coat: makeMaterial('teal wool', { color: palette.coat, roughness: .85 }),
    coatLight: makeMaterial('teal folded edges', { color: color(palette.coat, 1.33), roughness: .82 }),
    coatDark: makeMaterial('teal seams', { color: color(palette.coat, .6), roughness: .86 }),
    cloth: makeMaterial('charcoal weave', { color: palette.cloth, roughness: .94 }),
    leather: makeMaterial('oxblood leather', { color: palette.leather, roughness: .66 }),
    leatherLight: makeMaterial('worn leather edges', { color: color(palette.leather, 1.3), roughness: .72 }),
    metal: makeMaterial('blue steel', { color: palette.metal, roughness: .34, metalness: .76 }),
    brass: makeMaterial('aged brass', { color: palette.accent, roughness: .38, metalness: .7 }),
    dark: makeMaterial('deep seams', { color: '#151622', roughness: .88 }),
    eye: makeMaterial('warm eye whites', { color: '#eee0c5', roughness: .66 }),
    iris: makeMaterial('jade irises', { color: '#64b4a5', roughness: .34 }),
    blade: makeMaterial('violet blade', { color: palette.blade, roughness: .23, metalness: .65, emissive: palette.blade, emissiveIntensity: .15 }),
    bladeEdge: makeMaterial('polished blade edges', { color: new THREE.Color(palette.blade).lerp(new THREE.Color('#f4e6ff'), .6), roughness: .18, metalness: .8 }),
  };

  function bone(name, parent, x, y, z = 0) {
    const b = new THREE.Bone(); b.name = name; b.rotation.order = 'XYZ';
    b.position.set(x * s, y * s, z * s); bones[name] = b;
    (parent ? bones[parent] : root).add(b); return b;
  }
  bone('pelvis', null, 0, .935);
  bone('spine', 'pelvis', 0, .165);
  bone('chest', 'spine', 0, .225);
  bone('neck', 'chest', 0, .112);
  bone('head', 'neck', 0, .036);
  for (const [suffix, sign] of [['L', 1], ['R', -1]]) {
    bone(`upperArm${suffix}`, 'chest', sign * .211 * build, .060);
    bone(`forearm${suffix}`, `upperArm${suffix}`, 0, -.275);
    bone(`hand${suffix}`, `forearm${suffix}`, 0, -.255);
    bone(`thigh${suffix}`, 'pelvis', sign * .095 * build, 0);
    bone(`shin${suffix}`, `thigh${suffix}`, 0, -.425);
    bone(`foot${suffix}`, `shin${suffix}`, 0, -.410);
  }
  const boneList = HUMANOID_BONES.map(name => bones[name]);
  const boneIndex = Object.fromEntries(HUMANOID_BONES.map((name, i) => [name, i]));
  const skeleton = new THREE.Skeleton(boneList);

  function mesh(parent, g, m, name, position = [0, 0, 0]) {
    geometries.add(g);
    const object = new THREE.Mesh(g, m); object.name = name;
    object.position.set(...position); object.castShadow = true; object.receiveShadow = true;
    parent.add(object); meshes.push(object); return object;
  }
  function attachment(b, name, scale = 1) {
    const g = new THREE.Group(); g.name = name; g.scale.setScalar(s * scale); bones[b].add(g); return g;
  }
  function skinned(g, m, name, weightAt) {
    const indices = [], weights = [], attr = g.getAttribute('position');
    for (let i = 0; i < attr.count; i++) {
      const influences = weightAt(attr.getX(i), attr.getY(i), attr.getZ(i));
      for (let j = 0; j < 4; j++) {
        indices.push(influences[j] ? boneIndex[influences[j][0]] : 0);
        weights.push(influences[j]?.[1] ?? 0);
      }
    }
    g.scale(s, s, s);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geometries.add(g);
    const object = new THREE.SkinnedMesh(g, m); object.name = name;
    object.castShadow = true; object.receiveShadow = true;
    object.frustumCulled = false; root.add(object); meshes.push(object);
    return object;
  }
  function blendJoint(y, joint, above, below, radius = .045) {
    const t = THREE.MathUtils.smoothstep(y, joint - radius, joint + radius);
    return [[above, t], [below, 1 - t]];
  }
  function torsoWeights(x, y) {
    if (y < 1.14) return blendJoint(y, 1.085, 'spine', 'pelvis', .09);
    return blendJoint(y, 1.25, 'chest', 'spine', .10);
  }

  // The torso is one deforming surface across the waist and rib cage.
  const torso = loft([
    [.88, .125 * build, .064, .064], [.91, .138 * build, .075, .075],
    [.97, .138 * build, .080, .079], [1.04, .116 * build, .069, .066],
    [1.10, .120 * build, .071, .067], [1.16, .135 * build, .082, .071],
    [1.24, .156 * build, .092, .076], [1.31, .173 * build, .088, .075],
    [1.36, .183 * build, .075, .064], [1.392, .149 * build, .058, .055],
    [1.405, .071, .045, .043],
  ], 20);
  skinned(torso, mat.coat, 'tailored jacket / continuous waist', torsoWeights);

  // Narrow front inset follows the same weights, rather than floating over the chest.
  const bib = geometry([
    -.040, 1.08, .074, .040, 1.08, .074,
    -.052, 1.18, .090, .052, 1.18, .090,
    -.060, 1.30, .093, .060, 1.30, .093,
    -.044, 1.403, .053, .044, 1.403, .053,
  ], [0,1,2,1,3,2,2,3,4,3,5,4,4,5,6,5,7,6]);
  skinned(bib, mat.cloth, 'charcoal undershirt', torsoWeights);

  const neck = loft([
    [1.394, .043, .037], [1.422, .037, .033], [1.448, .034, .032],
    [1.472, .040, .035], [1.486, .045, .039],
  ]);
  skinned(neck, mat.skin, 'neck / continuous collar transition', (x,y) =>
    y < 1.443 ? blendJoint(y, 1.425, 'neck', 'chest', .033) : blendJoint(y, 1.465, 'head', 'neck', .022));

  for (const [suffix, sign] of [['L', 1], ['R', -1]]) {
    const ax = sign * .211 * build, hx = sign * .095 * build;
    const sleeve = loft([
      [.868,.034*limbWidth,.035,.032,ax], [.90,.037*limbWidth,.039,.035,ax],
      [.96,.046*limbWidth,.045,.040,ax], [1.035,.051*limbWidth,.047,.043,ax],
      [1.075,.046*limbWidth,.042,.040,ax], [1.105,.045*limbWidth,.042,.039,ax],
      [1.135,.051*limbWidth,.047,.043,ax], [1.21,.060*limbWidth,.054,.049,ax],
      [1.30,.064*limbWidth,.060,.053,ax], [1.362,.066*limbWidth,.061,.055,ax],
      [1.39,.043*limbWidth,.043,.039,ax-sign*.010*build], [1.404,.018,.025,.025,ax-sign*.025*build],
    ]);
    skinned(sleeve, mat.coat, `${suffix} sleeve / elbow blend`, (x,y) => {
      if (y > 1.335) {
        const shoulder = THREE.MathUtils.smoothstep(y, 1.335, 1.404) * .82;
        return [['chest', shoulder], [`upperArm${suffix}`, 1-shoulder]];
      }
      return blendJoint(y,1.110,`upperArm${suffix}`,`forearm${suffix}`, .065);
    });

    const leg = loft([
      [.12,.040*limbWidth,.046,.037,hx], [.18,.045*limbWidth,.046,.039,hx],
      [.28,.053*limbWidth,.052,.046,hx], [.39,.060*limbWidth,.056,.050,hx],
      [.475,.054*limbWidth,.053,.046,hx], [.51,.053*limbWidth,.054,.047,hx],
      [.555,.058*limbWidth,.057,.051,hx], [.64,.070*limbWidth,.063,.058,hx],
      [.77,.081*limbWidth,.072,.066,hx], [.875,.084*limbWidth,.075,.070,hx],
      [.945,.075*limbWidth,.074,.069,hx], [.967,.036,.042,.041,hx],
    ]);
    skinned(leg, mat.cloth, `${suffix} trousers / knee blend`, (x,y) => blendJoint(y,.510,`thigh${suffix}`,`shin${suffix}`, .072));

    // Fitted tall boots soften across the ankle instead of behaving like a rigid tube.
    const boot = loft([
      [.105,.043*limbWidth,.052,.042,hx], [.155,.047*limbWidth,.050,.041,hx],
      [.25,.055*limbWidth,.055,.047,hx], [.355,.063*limbWidth,.060,.051,hx],
      [.435,.059*limbWidth,.057,.049,hx], [.457,.060*limbWidth,.058,.050,hx],
    ]);
    skinned(boot, mat.leather, `${suffix} tall boot shaft`, (x,y) => blendJoint(y,.14,`shin${suffix}`,`foot${suffix}`, .043));

    const shin = attachment(`shin${suffix}`, `${suffix} boot fittings`);
    mesh(shin, loft([[-.079,.061*limbWidth,.059,.052],[-.059,.061*limbWidth,.059,.052]]), mat.leatherLight, 'rolled boot cuff');
    mesh(shin, plate([[-.026,-.105],[.026,-.105],[.036,-.16],[.027,-.32],[0,-.365],[-.027,-.32],[-.036,-.16]],.007), mat.metal, 'shaped shin guard', [0,0,.053]);
    mesh(shin, plate([[-.005,-.127],[.005,-.127],[.008,-.30],[0,-.328],[-.008,-.30]],.003), mat.brass, 'shin inlay', [0,0,.063]);
    for (const y of [-.135,-.285]) {
      const strap = mesh(shin,new THREE.BoxGeometry(.105*limbWidth,.013,.104),mat.dark,'boot strap',[0,y,.002]);
      mesh(strap,new THREE.BoxGeometry(.016,.022,.006),mat.brass,'strap clasp',[sign*.041,0,.056]);
    }
    const foot = attachment(`foot${suffix}`,`${suffix} shaped boot foot`);
    mesh(foot,loft([
      [-.093,.049,.135,.052,0,.029],[-.077,.053,.143,.054,0,.030],
      [-.046,.053,.139,.051,0,.029],[-.016,.043,.105,.043,0,.019],
      [.013,.039,.052,.037,0,.001],[.045,.040,.044,.036],
    ],16),mat.leather, 'boot / instep and tapered toe');
    mesh(foot,loft([[-.10,.052,.140,.055,0,.028],[-.086,.053,.143,.055,0,.028]],16),mat.dark,'grounded sole');
    mesh(foot,loft([[-.083,.0535,.144,.055,0,.028],[-.076,.054,.144,.055,0,.028]],16),mat.leatherLight,'sole welt');
    mesh(foot,plate([[-.037,-.063],[.037,-.063],[.043,-.044],[.030,-.024],[-.030,-.024],[-.043,-.044]],.003),mat.metal,'toe cap edge',[0,0,.157]);

    const arm = attachment(`upperArm${suffix}`,`${suffix} shoulder details`);
    mesh(arm,loft([[-.067,.069*limbWidth,.064,.058],[-.036,.073*limbWidth,.066,.061],[-.003,.067*limbWidth,.061,.057],[.015,.039,.041,.036]]), suffix === 'R' ? mat.leather : mat.coatDark, 'tailored shoulder overlay');
    if (suffix === 'R') {
      mesh(arm,plate([[-.042,-.066],[.044,-.066],[.054,-.032],[.027,.004],[-.025,.004],[-.052,-.032]],.009),mat.metal,'small sword-arm pauldron',[0,0,.059]);
      for (const x of [-.032,.032]) mesh(arm,new THREE.OctahedronGeometry(.006),mat.brass,'pauldron rivet',[x,-.044,.074]);
    } else {
      mesh(arm,plate([[-.022,-.085],[0,-.101],[.022,-.085],[.022,-.044],[0,-.029],[-.022,-.044]],.004),mat.brass,'hourglass arm badge',[0,0,.064]);
      mesh(arm,plate([[-.010,-.052],[.010,-.052],[0,-.066],[.010,-.082],[-.010,-.082],[0,-.066]],.002),mat.coatDark,'hourglass badge engraving',[0,0,.071]);
    }
    const forearm = attachment(`forearm${suffix}`,`${suffix} bracer`);
    mesh(forearm,loft([[-.247,.037,.038,.035],[-.229,.042,.041,.038],[-.16,.049,.046,.043],[-.126,.052,.048,.044]]),mat.leather,'fitted bracer');
    mesh(forearm,plate([[-.024,-.24],[.024,-.24],[.034,-.15],[.018,-.127],[-.018,-.127],[-.034,-.15]],.006),mat.metal,'bracer face',[0,0,.042]);
    for (const y of [-.229,-.148]) mesh(forearm,loft([[y-.006,.049,.048,.043],[y+.006,.049,.048,.043]],12),mat.brass,'bracer rim');
    const hand = attachment(`hand${suffix}`,`${suffix} gloved hand`);
    mesh(hand,loft([[-.12,.021,.018,.017],[-.105,.030,.023,.022],[-.049,.033,.025,.023],[-.017,.027,.025,.022],[.010,.029,.027,.024]],12),mat.leather,'sculpted glove');
    mesh(hand,plate([[-.022,-.025],[.022,-.025],[.024,-.077],[.014,-.089],[-.014,-.089],[-.024,-.077]],.004),mat.metal,'glove back plate',[0,0,-.030]).rotation.y = Math.PI;
    for (let j=0;j<4;j++) mesh(hand,loft([[-.132,.005,.010],[-.112,.007,.013],[-.088,.007,.013]],8),mat.leatherLight, 'separate glove finger',[(j-1.5)*.014,0,.004]);
    mesh(hand,sweep([[sign*.025,-.030,.004],[sign*.045,-.049,.015],[sign*.037,-.085,.032]],[.013,.014,.009],.9),mat.leather,'wrapped thumb');
  }

  const chest = attachment('chest','jacket tailoring');
  for (const sign of [-1,1]) {
    const lapel = mesh(chest,plate([[.025*sign,.071],[.071*sign,.071],[.090*sign,.025],[.056*sign,-.085],[.046*sign,-.019]],.009),mat.coatLight, 'folded jacket lapel',[0,0,.083]);
    lapel.rotation.y = sign * -.12;
    mesh(chest,sweep([[sign*.073,.053,.093],[sign*.073,-.002,.108],[sign*.054,-.060,.104]],[.003,.003,.002],.7,6),mat.brass,'lapel piping');
  }
  mesh(chest,loft([[.073,.049,.044,.041],[.108,.046,.040,.039]],16),mat.coatDark,'standing collar');
  mesh(chest,plate([[-.018,-.014],[.018,-.014],[.014,-.077],[-.014,-.077]],.004),mat.leather,'chest fastening',[0,0,.102]);
  for (const y of [-.026,-.060]) mesh(chest,new THREE.OctahedronGeometry(.006),mat.brass,'jacket stud',[0,y,.112]);
  // Diagonal baldric and pouch add an identifiable asymmetrical silhouette.
  mesh(chest,sweep([[.126,.045,.066],[.068,-.028,.114],[-.030,-.130,.111],[-.093,-.190,.087]],[.013,.013,.013,.013],.22,6),mat.leather,'diagonal leather baldric');
  mesh(chest,new THREE.BoxGeometry(.027,.036,.008),mat.brass,'baldric buckle',[.055,-.048,.117]).rotation.z = -.65;
  mesh(chest,new THREE.BoxGeometry(.015,.023,.010),mat.leather,'buckle opening',[.055,-.048,.123]).rotation.z = -.65;
  // Back seams read from the inspection camera without adding costume noise.
  for (const sign of [-1,1]) mesh(chest,sweep([[sign*.127,.021,-.063],[sign*.092,-.057,-.079],[sign*.064,-.157,-.073]],[.002,.002,.002],1,6),mat.coatLight,'back tailoring seam');

  const waist = attachment('pelvis','belt and split coat tails');
  mesh(waist,loft([[.064,.130*build,.084,.078],[.101,.126*build,.083,.077]],20),mat.leather,'waist belt');
  mesh(waist,new THREE.BoxGeometry(.044,.039,.012),mat.brass,'belt buckle',[.009,.082,.088]);
  mesh(waist,new THREE.BoxGeometry(.027,.024,.014),mat.dark,'belt buckle inset',[.009,.082,.096]);
  mesh(waist,new THREE.BoxGeometry(.006,.029,.015),mat.brass,'buckle tongue',[.009,.082,.105]);
  for (const sign of [-1,1]) {
    const tail = mesh(waist,plate([[sign*.035,.062],[sign*.118,.062],[sign*.141,-.068],[sign*.107,-.167],[sign*.044,-.135]],.012),mat.coatDark,'split jacket skirt',[0,0,-.075]);
    tail.rotation.y = sign * -.15;
  }
  const pouch = new THREE.Group(); pouch.position.set(.147*build,.036,.008); pouch.rotation.z=-.12; waist.add(pouch);
  mesh(pouch,loft([[-.074,.032,.038,.024],[-.051,.040,.043,.027],[.027,.037,.040,.025],[.037,.028,.034,.021]],12),mat.leather,'belt pouch');
  mesh(pouch,plate([[-.035,.027],[.035,.027],[.032,-.01],[0,-.024],[-.032,-.01]],.005),mat.leatherLight,'pouch flap',[0,0,.041]);
  mesh(pouch,new THREE.OctahedronGeometry(.006),mat.brass,'pouch stud',[0,-.009,.05]);

  const head = attachment('head','Kaida head',headScale);
  mesh(head,loft([
    [-.008,.025,.028,.021], [.009,.044,.048,.037], [.043,.062,.065,.050],
    [.081,.076,.076,.061], [.126,.080,.079,.067], [.170,.076,.072,.064],
    [.198,.057,.056,.052], [.216,.024,.026,.025], [.220,.002,.003,.003],
  ],24),mat.skin,'face / tapered jaw and cheek planes');
  // The nose is an authored wedge, with a restrained bridge and small underside.
  mesh(head,geometry([
    -.008,.137,.074, .008,.137,.074, -.010,.089,.078, .010,.089,.078,
    0,.081,.101, -.012,.073,.083, .012,.073,.083, 0,.076,.078,
  ],[0,2,4,0,4,1,1,4,3,2,5,4,3,4,6,5,7,4,4,7,6]),mat.skin,'nose bridge and tip');
  mesh(head,plate([[-.016,.046],[0,.049],[.017,.046],[.008,.042],[-.008,.042]],.001),mat.skinShade,'subtle mouth',[0,0,.067]);
  for (const sign of [-1,1]) {
    const ear=mesh(head,loft([[.070,.009,.012,.013],[.083,.015,.020,.019],[.111,.015,.019,.020],[.125,.006,.012,.012]],10),mat.skin,'ear',[sign*.078,0,-.005]);
    ear.rotation.z = -sign*.12;
    mesh(head,loft([[.083,.004,.009],[.104,.007,.011],[.114,.003,.006]],8),mat.skinShade,'ear hollow',[sign*.085,0,.005]);
    const eye = new THREE.Group(); eye.position.set(sign*.034,.116,.074); eye.rotation.y=sign*.22; head.add(eye);
    mesh(eye,plate([[-.023,0],[-.010,.011],[.012,.010],[.024,-.001],[.010,-.008],[-.009,-.008]],.002),mat.dark,'almond eye outline');
    mesh(eye,plate([[-.018,0],[-.009,.007],[.010,.006],[.019,-.001],[.008,-.005],[-.008,-.005]],.001),mat.eye,'eye white',[0,0,.004]);
    mesh(eye,plate([[-.007,-.003],[-.006,.006],[.004,.006],[.007,-.002],[.003,-.006],[-.004,-.006]],.001),mat.iris,'jade iris',[0,0,.007]);
    mesh(eye,new THREE.PlaneGeometry(.005,.010),mat.dark,'pupil',[0,.001,.010]);
    mesh(eye,new THREE.PlaneGeometry(.0028,.003),mat.eye,'eye glint',[-.002,.004,.011]);
    mesh(head,sweep([[sign*.015,.143,.079],[sign*.032,.148,.079],[sign*.054,.141,.064]],[.0025,.003,.0018],.7,6),mat.hairDark,'expressive eyebrow');
  }
  // Asymmetric swept hair: continuous scalp underneath separate broad, tapered locks.
  const hairPositions=[], hairIndices=[], radial=24, rows=8;
  for(let i=0;i<=rows;i++) for(let j=0;j<radial;j++) {
    const f=i/rows, a=j/radial*Math.PI*2, front=Math.sin(a);
    const hem=.103+.068*Math.max(0,front)-.026*Math.max(0,-front);
    const r=Math.sin(f*Math.PI*.47);
    hairPositions.push(-.009*(1-f)+Math.cos(a)*.087*r,.242+(hem-.242)*Math.pow(f,1.28),-.007+front*.082*r);
    if(i<rows){const n=i*radial+j,k=i*radial+(j+1)%radial;hairIndices.push(n,k,n+radial,k,k+radial,n+radial);}
  }
  mesh(head,geometry(hairPositions,hairIndices),mat.hairDark,'sculpted short hair foundation');
  for(let j=0;j<7;j++) {
    const z=.065-j*.019, x=.057-j*.006;
    mesh(head,sweep([[x,.191,z],[-.003,.244-j*.002,z+.008],[-.064,.219-j*.004,z+.010],[-.086,.158-j*.009,z+.016]],[.013,.024,.021,.0015],.45,8),j%3===0?mat.hairLight:mat.hair,`swept crown lock ${j+1}`);
  }
  for(const [points,radii] of [
    [[[.052,.193,.059],[.018,.200,.080],[-.021,.170,.089],[-.061,.139,.082]],[.017,.021,.017,.001]],
    [[[.024,.218,.063],[-.023,.204,.083],[-.062,.170,.088],[-.080,.116,.061]],[.017,.024,.019,.001]],
    [[[-.060,.203,.032],[-.090,.163,.033],[-.088,.106,.019],[-.095,.064,.021]],[.020,.024,.015,.001]],
    [[[.074,.159,-.011],[.084,.126,-.023],[.078,.078,-.036],[.069,.061,-.031]],[.015,.018,.012,.001]],
    [[[.034,.202,-.061],[.011,.160,-.088],[-.018,.096,-.089],[-.046,.060,-.073]],[.017,.026,.019,.001]],
  ]) mesh(head,sweep(points,radii,.48,8),mat.hair,'swept fringe and nape lock');
  mesh(head,sweep([[.072,.143,.028],[.071,.128,.038],[.069,.113,.047]],[.0025,.0025,.0025],1,6),mat.brass,'temple hair clasp');
  mesh(head,new THREE.OctahedronGeometry(.005),mat.brass,'single ear stud',[.089,.084,.014]);

  const weaponRoot = attachment('handR','violet sword',weaponScale);
  // The grip sits inside the glove; its local -Y axis agrees with the hand bone.
  weaponRoot.position.set(0,-.045*s,.032*s);
  mesh(weaponRoot,loft([[-.053,.013,.012],[.047,.013,.012]],12),mat.leather,'sword wrapped grip');
  for(let i=0;i<6;i++) mesh(weaponRoot,loft([[-.048+i*.016,.014,.013],[-.044+i*.016,.014,.013]],12),mat.brass,'grip wrap');
  mesh(weaponRoot,new THREE.OctahedronGeometry(.024),mat.metal,'pommel',[0,.061,0]);
  mesh(weaponRoot,new THREE.OctahedronGeometry(.010),mat.blade,'pommel violet stone',[0,.065,.017]);
  mesh(weaponRoot,plate([[-.098,-.081],[-.086,-.053],[-.029,-.062],[0,-.054],[.029,-.062],[.086,-.053],[.098,-.081],[.071,-.077],[.021,-.080],[-.021,-.080],[-.071,-.077]],.017),mat.brass,'swept sword guard',[0,0,-.0085]);
  const bladeG = geometry([
    -.025,-.079,0, 0,-.079,.009, .025,-.079,0, 0,-.079,-.009,
    -.022,-.45,0, 0,-.45,.008, .022,-.45,0, 0,-.45,-.008,
    -.014,-.554,0, 0,-.554,.006, .014,-.554,0, 0,-.554,-.006,
    0,-.61,0,
  ],[0,4,1,1,4,5,1,5,2,2,5,6,2,6,3,3,6,7,3,7,0,0,7,4,
    4,8,5,5,8,9,5,9,6,6,9,10,6,10,7,7,10,11,7,11,4,4,11,8,
    8,12,9,9,12,10,10,12,11,11,12,8]);
  mesh(weaponRoot,bladeG,mat.blade,'diamond section sword blade');
  mesh(weaponRoot,sweep([[0,-.087,.010],[0,-.43,.009],[0,-.558,.007],[0,-.61,0]],[.0028,.0024,.0016,.0002],.25,4),mat.bladeEdge,'bright central blade ridge');
  const tip = new THREE.Object3D(); tip.name='blade-tip'; tip.position.set(0,-.61,0); weaponRoot.add(tip);

  root.updateMatrixWorld(true);
  skeleton.calculateInverses();
  for (const object of meshes) if (object.isSkinnedMesh) object.bind(skeleton);
  root.updateMatrixWorld(true); skeleton.update();
  const rest = Object.fromEntries(HUMANOID_BONES.map(name => [name, {
    position:bones[name].position.clone(),quaternion:bones[name].quaternion.clone(),scale:bones[name].scale.clone(),
  }]));
  let disposed=false;
  return {
    root,bones,rest,skeleton,meshes,materials,weapon:{root:weaponRoot,tip},metrics,
    setWireframe(enabled){for(const m of materials)m.wireframe=!!enabled;},
    dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();skeleton.dispose();root.removeFromParent();},
  };
}
