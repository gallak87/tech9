import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createRouteClearance,
  groundFrame,
} from '../../../environment/placement.js';
import {
  seededRandom,
  disposeResources,
  instanceTemplate,
  tube,
  createSceneryClearance,
  consolidateStaticInstances,
} from './geometry.js';
import { createCanopyWalker } from './creature.js';
import { finishVesperMaterial } from './materials.js';

const ASSET_URL = '/assets/levels/vesper/vesper-canopy.glb';

export function createVesperEnvironment({
  track,
  settings = {},
  loadAsset,
} = {}) {
  const group = new T.Group();
  group.name = 'Vesper / layered living canopy and amber transport habitat';
  const details = new T.Group();
  details.name = 'Vesper / optional fine foliage';
  group.add(details);
  const highTrees = new T.Group();
  const lowTrees = new T.Group();
  highTrees.name = 'Vesper / close foliage geometry high';
  lowTrees.name = 'Vesper / close foliage geometry low';
  group.add(highTrees, lowTrees);
  const random = seededRandom();
  const clearance = createRouteClearance(track, {
    sidePadding: 14,
    localVertical: [-16, 30],
  });
  const ground = track.groundY ?? -100;
  const dawnSection = track.sections.find(
    (section) => section.id === 'dawnscar',
  );
  const dawnFrame = groundFrame(track, dawnSection.showcase - 15);
  const dawnDirection = track
    .sample(dawnSection.showcase + 115)
    .position.sub(dawnFrame.position)
    .setY(0)
    .normalize();
  const inCreatureOpening = (position) =>
    position.x > 440 &&
    position.x < 1140 &&
    position.z > -235 &&
    position.z < 170;
  const inDawnOpening = (position, radius = 0) => {
    const d = position.clone().sub(dawnFrame.position);
    const along = d.dot(dawnDirection);
    const across = Math.abs(d.x * dawnDirection.z - d.z * dawnDirection.x);
    return along > 60 && along < 2200 && across < 55 + along * 0.28 + radius;
  };
  const ownedMaterials = [];
  const material = (name, options) => {
    const value = new T.MeshStandardMaterial({ name, ...options });
    finishVesperMaterial(value);
    ownedMaterials.push(value);
    return value;
  };
  const bark = material('Vesper / structural living root', {
    color: '#25352f',
    roughness: 0.88,
  });
  const sapwood = material('Vesper / root collar cut face', {
    color: '#88714a',
    roughness: 0.76,
  });
  const warm = material('Vesper / maintenance sap lamps', {
    color: '#f2ab36',
    emissive: '#ff9a25',
    emissiveIntensity: 1.6,
    roughness: 0.28,
  });
  const poolMaterial = material('Vesper / still black fungal pools', {
    color: '#091f26',
    roughness: 0.15,
    metalness: 0.5,
  });
  const floorMaterial = material('Vesper / forest floor terraces', {
    color: '#14252a',
    roughness: 0.96,
  });
  let disposed = false;
  let assetScene;
  let creature;
  const treeLods = [];
  let loaded = false;
  const metrics = {
    assetUrl: ASSET_URL,
    authoredTemplates: 17,
    closeTrees: 0,
    distantTrees: 0,
    foliageClusters: 0,
    fungusClusters: 0,
    supportAnchors: 0,
    shellAnchors: 0,
    omittedAnchors: 0,
    gateTrunks: 0,
    heroLandmarks: 4,
    renderedTriangles: null,
    loadState: 'pending',
    clearanceRejected: 0,
  };
  group.userData.metrics = metrics;
  group.userData.anchorClearance = {
    omitted: [],
    radius: 4,
    routeSpacing: 6,
    curveSpacing: 3,
  };

  // Uneven three-dimensional floor remains well below the lowest usable deck.
  const floorGeometry = new T.PlaneGeometry(4200, 3700, 86, 74).rotateX(
    -Math.PI / 2,
  );
  const vertices = floorGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i);
    vertices.setY(
      i,
      ground -
        8 +
        Math.sin(x * 0.011) * Math.cos(z * 0.009) * 12 +
        Math.sin((x + z) * 0.021) * 4,
    );
  }
  floorGeometry.computeVertexNormals();
  const floor = new T.Mesh(floorGeometry, floorMaterial);
  floor.position.set(300, 0, 0);
  floor.receiveShadow = true;
  floor.name = 'Vesper / continuous ravine floor and root terraces';
  group.add(floor);

  // Match the raceway builder's paired root sockets; each terminates in a grounded collar.
  const anchorParts = [];
  const clearsSupport = createSceneryClearance(track);
  // Keep the defining enclosed trunk outside the internal road spiral.
  const hollowData = {
    ...track.landmarks.hollow,
    radius: track.landmarks.hollow.radius + 46,
  };
  const hollowCenter = new T.Vector3(...hollowData.center);
  const collars = [];
  for (let s = 18; s < track.length; s += 76) {
    if (track.isGap?.(s)) continue;
    const f = track.sample(s);
    for (const side of [-1, 1]) {
      if (side === 1 && s >= 1460 && s <= 1540) continue;
      const depth = Math.min(48, Math.max(24, (f.position.y + 80) * 0.55));
      const socket = f.position
        .clone()
        .addScaledVector(f.right, side * 25)
        .addScaledVector(f.up, -depth)
        .addScaledVector(f.tangent, -17);
      let accepted = null;
      let grounded = true;
      // Interior loads enter the enclosing living trunk without crossing the lower spiral.
      const radial = socket.clone().sub(hollowCenter).setY(0);
      if (
        radial.length() < hollowData.radius + 22 &&
        socket.y > hollowData.base + 18 &&
        socket.y < hollowData.top - 12
      ) {
        const baseAngle = Math.atan2(radial.z, radial.x);
        for (const offset of [0, 0.18, -0.18, 0.38, -0.38, 0.65, -0.65]) {
          const a = baseAngle + offset,
            t =
              (socket.y - 10 - hollowData.base) /
              (hollowData.top - hollowData.base);
          const radius =
            hollowData.radius * (1 - 0.08 * t) +
            5.5 * Math.sin(a * 19 + t * 3) +
            2.2 * Math.sin(a * 37 - t * 4) -
            4;
          const end = new T.Vector3(
            hollowCenter.x + Math.cos(a) * radius,
            socket.y - 10,
            hollowCenter.z + Math.sin(a) * radius,
          );
          const knee = socket
            .clone()
            .lerp(end, 0.55)
            .add(new T.Vector3(0, -5, 0));
          if (clearsSupport([socket, knee, end])) {
            accepted = [socket, knee, end];
            grounded = false;
            break;
          }
        }
      }
      if (!accepted && radial.length() < hollowData.radius + 22) {
        const a0 = Math.atan2(radial.z, radial.x);
        search: for (const heightOffset of [15, 30, -30, -45, 45]) {
          for (const offset of [
            0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6,
          ]) {
            const y = socket.y + heightOffset;
            if (y < hollowData.base + 12 || y > hollowData.top - 20) continue;
            const a = a0 + offset,
              t = (y - hollowData.base) / (hollowData.top - hollowData.base);
            const radius =
              hollowData.radius * (1 - 0.08 * t) +
              5.5 * Math.sin(a * 19 + t * 3) +
              2.2 * Math.sin(a * 37 - t * 4) -
              4;
            const end = new T.Vector3(
              hollowCenter.x + Math.cos(a) * radius,
              y,
              hollowCenter.z + Math.sin(a) * radius,
            );
            const knee = socket.clone().lerp(end, 0.48);
            if (clearsSupport([socket, knee, end])) {
              accepted = [socket, knee, end];
              grounded = false;
              break search;
            }
          }
        }
      }
      if (!accepted)
        for (const offset of [10, 35, 65, 100, -35, -65]) {
          const foot = socket.clone().addScaledVector(f.right, side * offset);
          foot.y = ground - 14;
          const knee = socket
            .clone()
            .lerp(foot, 0.44)
            .addScaledVector(f.right, side * 5);
          if (clearsSupport([socket, knee, foot])) {
            accepted = [socket, knee, foot];
            break;
          }
        }
      if (!accepted) {
        metrics.omittedAnchors++;
        group.userData.anchorClearance.omitted.push({ s, side });
        continue;
      }
      anchorParts.push(tube(accepted, 3.6, 18, 7));
      if (grounded)
        collars.push({
          position: accepted[2].clone().add(new T.Vector3(0, 3, 0)),
          scale: [12, 6, 11],
        });
      else metrics.shellAnchors++;
      metrics.supportAnchors++;
    }
  }
  if (anchorParts.length) {
    const geometry = mergeGeometries(anchorParts);
    for (const part of anchorParts) part.dispose();
    const mesh = new T.Mesh(geometry, bark);
    mesh.name = 'Vesper / load sockets carried into grounded root columns';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const collarMesh = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    sapwood,
    collars.length,
  );
  const dummy = new T.Object3D();
  collars.forEach((collar, i) => {
    dummy.position.copy(collar.position);
    dummy.scale.fromArray(collar.scale);
    dummy.updateMatrix();
    collarMesh.setMatrixAt(i, dummy.matrix);
  });
  collarMesh.name = 'Vesper / rooted load-transfer collars';
  collarMesh.receiveShadow = true;
  group.add(collarMesh);

  const lanternSites = [];
  for (let s = 4; s < track.length; s += 42) {
    const f = track.sample(s);
    const side = Math.floor(s / 42) % 2 ? 1 : -1;
    const p = f.position
      .clone()
      .addScaledVector(f.right, side * 23)
      .addScaledVector(f.up, 8);
    lanternSites.push({ s, position: p });
  }
  const lamps = new T.InstancedMesh(
    new T.SphereGeometry(1, 7, 5),
    warm,
    lanternSites.length,
  );
  const stems = [];
  lanternSites.forEach(({ position }, i) => {
    dummy.position.copy(position);
    dummy.scale.set(0.72, 1.7, 0.72);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
    stems.push(
      tube(
        [
          position.clone().add(new T.Vector3(0, -11, 0)),
          position.clone().add(new T.Vector3(1.5, -3, 0)),
          position,
        ],
        0.35,
        6,
        5,
      ),
    );
  });
  lamps.name = 'Vesper / continuous warm maintenance lanterns';
  group.add(lamps);
  const stemGeometry = mergeGeometries(stems);
  for (const stem of stems) stem.dispose();
  const stemMesh = new T.Mesh(stemGeometry, sapwood);
  stemMesh.name = 'Vesper / grown lantern stems';
  group.add(stemMesh);
  const practicalLights = Array.from({ length: 7 }, () => {
    const light = new T.PointLight('#ffc878', 110, 60, 2);
    group.add(light);
    return light;
  });

  // Rootfall uses open ribs with a wide camera aperture, alternating dark pockets and exits.
  const rootfall = track.sections.find((section) => section.id === 'rootfall');
  const vault = track.sections.find((section) => section.id === 'vault');
  if (rootfall) {
    const ribs = [];
    for (let s = rootfall.start + 24; s < rootfall.end; s += 38) {
      const f = track.sample(s);
      const points = [];
      for (let j = 0; j <= 16; j++) {
        const a = (j / 16) * Math.PI;
        points.push(
          f.position
            .clone()
            .addScaledVector(f.right, Math.cos(a) * 37)
            .addScaledVector(f.up, Math.sin(a) * 39 - 9),
        );
      }
      ribs.push(tube(points, 3.2, 24, 8));
    }
    const geometry = mergeGeometries(ribs);
    for (const rib of ribs) rib.dispose();
    const mesh = new T.Mesh(geometry, bark);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'Vesper / open exposed-root descent ribs';
    group.add(mesh);
  }
  if (vault) {
    for (let s = vault.start + 26; s < vault.end; s += 76) {
      const f = groundFrame(track, s);
      for (const side of [-1, 1]) {
        const pool = new T.Mesh(
          new T.CircleGeometry(36, 32).rotateX(-Math.PI / 2),
          poolMaterial,
        );
        pool.position.copy(f.position).addScaledVector(f.right, side * 64);
        pool.position.y -= 25;
        pool.scale.set(1, 1, 0.63);
        pool.name = 'Vesper / shallow mycelium pool';
        group.add(pool);
      }
    }
  }

  if (vault) {
    const vaultRoots = [];
    for (let s = vault.start + 30; s < vault.end; s += 103) {
      const f = groundFrame(track, s);
      for (const side of [-1, 1]) {
        const a = f.position
          .clone()
          .addScaledVector(f.right, side * 44)
          .add(new T.Vector3(0, -26, 0));
        const b = a
          .clone()
          .addScaledVector(f.right, side * 22)
          .addScaledVector(f.tangent, 31)
          .add(new T.Vector3(0, 16, 0));
        const c = b
          .clone()
          .addScaledVector(f.tangent, 36)
          .add(new T.Vector3(0, -12, 0));
        if (clearsSupport([a, b, c], 5))
          vaultRoots.push(tube([a, b, c], 4.5, 13, 7));
      }
    }
    if (vaultRoots.length) {
      const g = mergeGeometries(vaultRoots);
      vaultRoots.forEach((x) => x.dispose());
      const roots = new T.Mesh(g, bark);
      roots.name = 'Vesper / low fungal root shelves';
      roots.receiveShadow = true;
      group.add(roots);
    }
    const cool = new T.PointLight('#6ac9c0', 580, 145, 2);
    cool.position
      .copy(track.sample(vault.showcase + 45).position)
      .add(new T.Vector3(25, 25, 0));
    group.add(cool);
  }
  // Torn boughs frame an intentional pale horizon opening on the return.
  const scarRibs = [];
  for (const side of [-1, 1]) {
    const f = groundFrame(track, dawnSection.showcase + 50);
    const a = f.position
      .clone()
      .addScaledVector(f.right, side * 65)
      .add(new T.Vector3(0, -50, 0));
    const b = a
      .clone()
      .addScaledVector(f.right, side * 9)
      .add(new T.Vector3(0, 89, 0));
    const c = b
      .clone()
      .addScaledVector(f.right, -side * 35)
      .addScaledVector(f.tangent, 17)
      .add(new T.Vector3(0, 31, 0));
    if (clearsSupport([a, b, c], 8)) scarRibs.push(tube([a, b, c], 7, 22, 9));
  }
  if (scarRibs.length) {
    const g = mergeGeometries(scarRibs);
    scarRibs.forEach((x) => x.dispose());
    const crown = new T.Mesh(g, bark);
    crown.name = 'Vesper / torn crown framing Dawnscar';
    crown.castShadow = true;
    crown.receiveShadow = true;
    group.add(crown);
  }

  function accept(gltf) {
    assetScene = gltf.scene;
    if (disposed) {
      disposeResources([assetScene]);
      assetScene.clear();
      return;
    }
    assetScene.updateMatrixWorld(true);
    const get = (name) => {
      const value = assetScene.getObjectByName(name);
      if (!value) throw new Error(`Vesper asset is missing ${name}`);
      return value;
    };
    assetScene.traverse((object) => {
      if (!object.isMesh) return;
      for (const m of [object.material].flat()) {
        m.side = T.DoubleSide;
        m.envMapIntensity = 0.32;
        finishVesperMaterial(m);
      }
    });
    const hollow = get('hero_hollow').clone(true);
    hollow.position.set(
      track.landmarks.hollow.center[0],
      track.landmarks.hollow.base,
      track.landmarks.hollow.center[2],
    );
    hollow.name =
      'Vesper / colossal living hollow with route-cut entry and crown';
    hollow.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    group.add(hollow);
    const flowerFrame = groundFrame(track, track.landmarks.flower.s);
    const flower = get('hero_flower').clone(true);
    flower.position
      .copy(flowerFrame.position)
      .addScaledVector(flowerFrame.right, 21);
    flower.position.y += 137;
    flower.rotation.y = -0.3;
    flower.name = 'Vesper / enormous hanging layered flower';
    flower.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    group.add(flower);
    const flowerLight = new T.PointLight('#ffcc8a', 2400, 160, 2);
    flowerLight.position.copy(flower.position).add(new T.Vector3(0, -35, 0));
    group.add(flowerLight);
    const stationFrame = groundFrame(track, track.landmarks.station.s + 20);
    const station = get('seedpod_station').clone(true);
    station.position
      .copy(stationFrame.position)
      .addScaledVector(stationFrame.right, 53);
    station.position.y -= 7;
    station.rotation.y = Math.atan2(
      stationFrame.tangent.x,
      stationFrame.tangent.z,
    );
    station.name = 'Vesper / split seedpod station';
    group.add(station);
    const stationLight = new T.PointLight('#ffc77c', 1000, 95, 2);
    stationLight.position.copy(station.position).add(new T.Vector3(0, 20, 0));
    group.add(stationLight);
    const branchFrame = groundFrame(track, track.jumps[0].landingStart + 95);
    const branch = get('landing_branch').clone(true);
    branch.position.copy(branchFrame.position).add(new T.Vector3(0, -6, 0));
    branch.rotation.y = Math.atan2(
      branchFrame.tangent.x,
      branchFrame.tangent.z,
    );
    group.add(branch);

    const templateBounds = [0, 1, 2].map((i) =>
      new T.Box3().setFromObject(get(`tree_${i}`)).getSize(new T.Vector3()),
    );
    // Near/mid/far layers are authored geometry instances with clearance in every district.
    const near = [[], [], []],
      distant = [[], [], []],
      foliage = [[], [], []],
      roots = [[], []],
      fans = [];
    for (let s = 35; s < track.length; s += 101) {
      const f = groundFrame(track, s);
      for (const side of [-1, 1]) {
        const variant = Math.floor(random() * 3),
          scale = 0.75 + random() * 0.48;
        const p = f.position
          .clone()
          .addScaledVector(f.right, side * (114 + random() * 76))
          .addScaledVector(f.tangent, (random() - 0.5) * 60);
        p.y = ground;
        const height = templateBounds[variant].y * scale;
        const footprint =
          Math.hypot(templateBounds[variant].x, templateBounds[variant].z) *
            scale +
          8;
        if (
          !clearance.clears(
            p.x,
            p.z,
            footprint,
            footprint,
            ground + height,
            0,
            ground - 5,
          ) ||
          p.distanceTo(new T.Vector3(...track.landmarks.hollow.center)) < 245
        ) {
          metrics.clearanceRejected++;
          continue;
        }
        if (inDawnOpening(p, footprint * 0.5) || inCreatureOpening(p)) continue;
        const place = {
          position: p.toArray(),
          scale: [scale, scale, scale],
          yaw: random() * Math.PI * 2,
        };
        if (near.flat().length < 34) near[variant].push(place);
        else distant[variant].push(place);
      }
      for (const side of [-1, 1]) {
        const p = f.position
          .clone()
          .addScaledVector(f.right, side * (82 + random() * 20));
        p.y -= 18 + random() * 26;
        if (clearance.clears(p.x, p.z, 65, 65, p.y + 26, 0, p.y - 6)) {
          const variant = Math.floor(random() * 3);
          foliage[variant].push({
            position: p.toArray(),
            scale: [0.8, 0.8, 0.8],
            yaw: random() * Math.PI * 2,
          });
        }
        const rp = f.position
          .clone()
          .addScaledVector(f.right, side * 52)
          .add(new T.Vector3(0, -28, 0));
        if (
          clearance.clears(
            rp.x,
            rp.z,
            28,
            85,
            rp.y + 8,
            Math.atan2(f.tangent.x, f.tangent.z),
            rp.y - 25,
          )
        )
          roots[Math.floor(random() * 2)].push({
            position: rp.toArray(),
            yaw: Math.atan2(f.tangent.x, f.tangent.z),
          });
      }
    }
    const center = new T.Vector3(290, ground, -10);
    for (let i = 0; i < 138; i++) {
      const a = random() * Math.PI * 2,
        radius = 600 + random() * 1450;
      const p = center
        .clone()
        .add(new T.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      const variant = i % 3,
        scale = 1.0 + random() * 1.7;
      if (
        !clearance.clears(
          p.x,
          p.z,
          Math.hypot(templateBounds[variant].x, templateBounds[variant].z) *
            scale,
          Math.hypot(templateBounds[variant].x, templateBounds[variant].z) *
            scale,
          ground + 240 * scale,
          0,
          ground,
        )
      )
        continue;
      if (inDawnOpening(p, 65 * scale) || inCreatureOpening(p)) continue;
      distant[variant].push({
        position: p.toArray(),
        scale: [scale, scale, scale],
        yaw: random() * Math.PI * 2,
      });
    }
    if (vault)
      for (let s = vault.start; s < vault.end + 30; s += 48) {
        const f = groundFrame(track, s);
        for (const side of [-1, 1]) {
          for (const offset of [63, 82, 101]) {
            const p = f.position
              .clone()
              .addScaledVector(f.right, side * offset);
            p.y -= 23;
            if (!clearance.clears(p.x, p.z, 51, 51, p.y + 64, 0, p.y)) continue;
            fans.push({
              position: p.toArray(),
              yaw: random() * Math.PI * 2,
              scale: [1, 1, 1],
            });
            break;
          }
        }
      }
    for (let i = 0; i < 3; i++) {
      for (const placement of near[i]) {
        const detailed = new T.Group(),
          simple = new T.Group();
        highTrees.add(detailed);
        lowTrees.add(simple);
        instanceTemplate(get(`tree_${i}`), [placement], detailed, {
          shadow: true,
        });
        instanceTemplate(get(`tree_lod_${i}`), [placement], simple);
        // Fine leaf-vein geometry need not be submitted again to shadow maps.
        detailed.traverse((mesh) => {
          if (mesh.isMesh && !mesh.material.name.includes('bark'))
            mesh.castShadow = false;
        });
        treeLods.push({
          detailed,
          simple,
          center: new T.Vector3(...placement.position).add(
            new T.Vector3(0, 100, 0),
          ),
        });
      }
      instanceTemplate(get(`tree_lod_${i}`), distant[i], group);
      instanceTemplate(get(`foliage_${i}`), foliage[i], group);
      metrics.closeTrees += near[i].length;
      metrics.distantTrees += distant[i].length;
      metrics.foliageClusters += foliage[i].length;
    }
    for (let i = 0; i < 2; i++)
      instanceTemplate(get(`root_${i}`), roots[i], group, { shadow: true });
    instanceTemplate(get('fungal_fan'), fans, group);
    metrics.fungusClusters = fans.length;

    // Three pillars deliberately differ in taper, wound silhouette and crown tier.
    const pillar = track.sections.find((section) => section.id === 'pillar');
    if (pillar)
      for (let i = 0; i < 3; i++) {
        const f = groundFrame(track, pillar.start - 100 + i * 55);
        for (const offset of [
          126, 170, 214, 258, 302, 358, 420, -170, -258, -350,
        ]) {
          const p = f.position
            .clone()
            .addScaledVector(f.right, (i % 2 ? -1 : 1) * offset);
          p.y = ground;
          if (!clearance.clears(p.x, p.z, 212, 212, ground + 295, 0, ground))
            continue;
          const tree = get(`tree_${i}`).clone(true);
          tree.position.copy(p);
          tree.scale.setScalar(1.25);
          tree.rotation.y = i * 1.9;
          tree.name = `Vesper / three-trunk gate ${i + 1}`;
          group.add(tree);
          metrics.gateTrunks++;
          break;
        }
      }
    const bent = [];
    for (const [i, site] of [
      [0, [1060, ground, -160]],
      [1, [815, ground, -122]],
      [2, [610, ground, -138]],
    ]) {
      const p = new T.Vector3(...site);
      if (!clearance.clears(p.x, p.z, 196, 196, ground + 260, 0, ground))
        continue;
      const tree = get(`tree_${i}`).clone(true);
      tree.position.copy(p);
      tree.scale.setScalar(1.15);
      tree.name = 'Vesper / crown flexed by approaching walker';
      group.add(tree);
      bent.push(tree);
    }
    metrics.bendingCrowns = bent.length;
    consolidateStaticInstances(group);
    creature = createCanopyWalker(get('hero_walker'), track, group, bent);
    loaded = true;
    metrics.loadState = 'ready';
    setQuality(settings);
    creature.update({ settings, time: 0, state: { distance: 0 } });
  }
  function setQuality(next, camera) {
    const low = next.quality === 'low';
    highTrees.visible = !low;
    lowTrees.visible = true;
    for (const { detailed, simple, center } of treeLods) {
      detailed.visible =
        !low && Boolean(camera) && center.distanceTo(camera.position) < 240;
      simple.visible = !detailed.visible;
    }
    details.visible = !low;
  }
  const ready =
    loadAsset ||
    (typeof document !== 'undefined' && typeof location !== 'undefined')
      ? Promise.resolve()
          .then(() =>
            (loadAsset ?? (() => new GLTFLoader().loadAsync(ASSET_URL)))(
              ASSET_URL,
            ),
          )
          .then(accept)
          .catch((error) => {
            metrics.loadState = 'failed';
            throw error;
          })
      : Promise.resolve();
  return {
    group,
    ready,
    update(frame = {}) {
      // Production overview preserves the living world; shape review owns a bare scene.
      group.visible = true;
      const next = frame.settings ?? settings;
      setQuality(next, frame.camera);
      const s = frame.state?.distance ?? 0;
      const nearest = Math.round(s / 42);
      practicalLights.forEach((light, i) => {
        const index =
          (((nearest + i - 2) % lanternSites.length) + lanternSites.length) %
          lanternSites.length;
        light.position.copy(lanternSites[index].position);
        light.intensity = next.quality === 'low' && i > 3 ? 0 : 110;
      });
      if (loaded) creature.update(frame);
    },
    reset() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeResources([group, assetScene], ownedMaterials);
      group.clear();
      assetScene?.clear();
    },
  };
}
