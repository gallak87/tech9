import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { assetURL } from '../../../assets/url.js';
import { createHelionCeramicMaps } from '../../helion/track/ceramic-maps.js';
import {
  finishNightweirConcrete,
  finishNightweirMetal,
  finishNightweirBrick,
  finishNightweirRoof,
  finishNightweirRock,
} from '../../nightweir/environment/materials.js';
import {
  createNightweirBlackstart,
  finishNightweirWindows,
} from '../../nightweir/environment/blackstart.js';
import { createLockdownLayout, WORLD_UP } from './layout.js';
import { createLockdownWater } from './water.js';

// A new occupied basin district, composed around this circuit's clearance
// envelope. The long sprint's merged 150MB city is intentionally not loaded or
// laid over a different road; its registered finish, water and machinery kit is
// reused at authored metre scales in an independent city composition.
export async function createLockdownEnvironment({
  track,
  view,
  shape = false,
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
}) {
  const group = new T.Group();
  group.name = 'Nightweir Lockdown / inhabited hydroelectric basin';
  if (shape)
    return {
      group,
      dispose() {
        group.clear();
      },
    };
  const layout = createLockdownLayout(track),
    textures = new Set(),
    materials = new Set(),
    geometries = new Set(),
    buckets = new Map(),
    fixtures = [];
  let maps,
    water,
    machinery,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    water?.dispose();
    machinery?.dispose();
    maps?.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    group.clear();
  };
  try {
    const paths = [
      'assets/levels/nightweir/fired-brick-v1.png',
      'assets/levels/nightweir/zinc-roof-v1.png',
      'assets/levels/shatterline/limestone-v1.png',
      'assets/levels/nightweir/gorge-strata-v1.png',
      'assets/levels/nightweir/damp-scree-v1.png',
    ];
    const loaded = await Promise.allSettled(
      paths.map(async (path) => {
        const texture = await loadTexture(assetURL(path));
        textures.add(texture);
        texture.colorSpace = T.SRGBColorSpace;
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.anisotropy = Math.min(
          8,
          view?.renderer?.capabilities.getMaxAnisotropy() ?? 1,
        );
        return texture;
      }),
    );
    const failure = loaded.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    const [brickMap, roofMap, rockMap, cliffMap, screeMap] = loaded.map(
      (result) => result.value,
    );
    brickMap.repeat.setScalar(1 / 1.25);
    roofMap.repeat.setScalar(1 / 8);
    const mat = (name, values) => {
      const material = new T.MeshStandardMaterial({
        name: `Nightweir / Lockdown ${name}`,
        ...values,
      });
      materials.add(material);
      return material;
    };
    const concrete = mat('weathered precast', {
      color: '#a1aca7',
      roughness: 0.85,
      metalness: 0.015,
    });
    const stone = mat('damp retaining stone', {
      color: '#475c64',
      roughness: 0.9,
    });
    const plaster = mat('limestone plaster', {
      color: '#abae9b',
      roughness: 0.87,
    });
    const brick = mat('weathered fired brick', {
      color: '#8b786e',
      roughness: 0.88,
    });
    const roof = mat('weathered zinc roofing', {
      color: '#889497',
      roughness: 0.65,
      metalness: 0.32,
    });
    const iron = mat('blackened ironwork', {
      color: '#3a535c',
      roughness: 0.5,
      metalness: 0.45,
    });
    const seal = mat('inset service gasket', {
      color: '#17272c',
      roughness: 0.84,
      metalness: 0.03,
    });
    const splash = mat('wet hydraulic bearing stone', {
      color: '#3d555c',
      roughness: 0.46,
      metalness: 0.025,
    });
    const alloy = mat('machined service connection steel', {
      color: '#81959d',
      roughness: 0.34,
      metalness: 0.74,
    });
    const pressure = mat('cold coated pressure steel', {
      color: '#58737b',
      roughness: 0.42,
      metalness: 0.58,
    });
    const recess = mat('absorptive hydraulic recess', {
      color: '#25373e',
      roughness: 0.94,
      metalness: 0.01,
    });
    const oxide = mat('oxide hydraulic machinery', {
      color: '#725546',
      roughness: 0.55,
      metalness: 0.4,
    });
    const rock = mat('wet gorge bedrock', { color: '#7b8888', roughness: 0.9 });
    const workLight = new T.MeshBasicMaterial({
      name: 'Nightweir / Lockdown shielded working light diffuser',
      color: '#c7ab85',
      toneMapped: true,
    });
    materials.add(workLight);
    const workRooms = mat('occupied process control rooms', {
      color: '#b9b4a5',
      emissive: '#edb572',
      emissiveIntensity: 0.95,
      roughness: 0.3,
    });
    const amber = mat('occupied amber rooms', {
      color: '#d3ac79',
      emissive: '#e3a963',
      emissiveIntensity: 0.42,
      roughness: 0.3,
    });
    const pale = mat('occupied pale rooms', {
      color: '#b5c6be',
      emissive: '#d3d8ba',
      emissiveIntensity: 0.3,
      roughness: 0.3,
    });
    const glass = mat('recessed blue glass', {
      color: '#253f4b',
      roughness: 0.3,
      metalness: 0.1,
    });
    for (const material of [concrete, stone, plaster, recess])
      finishNightweirConcrete(material);
    for (const material of [iron, oxide, pressure])
      finishNightweirMetal(material);
    // Rain catches the real upward faces; sheltered returns stay diffuse.
    // This preserves material roles rather than overlaying general grime.
    for (const material of [concrete, stone, plaster, iron, oxide, pressure]) {
      const finish = material.onBeforeCompile,
        key = material.customProgramCacheKey(),
        masonry = [concrete, stone, plaster].includes(material);
      material.onBeforeCompile = (shader, renderer) => {
        finish(shader, renderer);
        shader.vertexShader =
          'varying float lockFinishUp;\n' +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nlockFinishUp=(mat3(modelMatrix)*normal).y;',
          );
        shader.fragmentShader =
          'varying float lockFinishUp;\n' + shader.fragmentShader;
        if (masonry)
          shader.fragmentShader = shader.fragmentShader.replace(
            'roughnessFactor=clamp(roughnessFactor+.12*patina,.62,.96);',
            'float rainCatch=smoothstep(-.1,.85,lockFinishUp);float wetness=clamp(rainCatch*.78+patina*.4,0.,1.);roughnessFactor=mix(.88,.50,wetness);',
          );
        else
          shader.fragmentShader = shader.fragmentShader.replace(
            'roughnessFactor=clamp(roughnessFactor+(worn-.5)*.1-runoff*.08,.42,.82);',
            'float rainCatch=smoothstep(-.15,.65,lockFinishUp);roughnessFactor=clamp(roughnessFactor+.13*(1.-rainCatch)+(worn-.5)*.04-runoff*.08,.34,.82);',
          );
      };
      material.customProgramCacheKey = () => key + '-lockdown-shelter-response';
    }
    pressure.roughness = 0.38;
    pressure.metalness = 0.54;
    finishNightweirBrick(brick, brickMap);
    finishNightweirRoof(roof, roofMap);
    const roofFinish = roof.onBeforeCompile,
      roofKey = roof.customProgramCacheKey();
    roof.onBeforeCompile = (shader, renderer) => {
      roofFinish(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        'roughnessFactor=.56+.22*(1.-age);',
        'roughnessFactor=.39+.23*(1.-age);',
      );
    };
    roof.customProgramCacheKey = () => roofKey + '-lockdown-wet-pan-reflection';
    finishNightweirRock(rock, rockMap, cliffMap, screeMap);
    const occupied = { front: { value: 1e9 }, distance: { value: 0 } };
    for (const material of [amber, pale, glass, workRooms]) {
      finishNightweirWindows(material, occupied);
      const finish = material.onBeforeCompile,
        previousKey = material.customProgramCacheKey(),
        gain =
          material === workRooms
            ? 1.15
            : material === glass
              ? 1
              : material === pale
                ? 0.7
                : 0.58;
      material.userData.window = true;
      material.userData.windowGain = gain;
      material.roughness = material === glass ? 0.19 : 0.24;
      // The reused room shader owns emission, so tune its actual radiance
      // after its interior calculation, rather than an ignored material knob.
      material.onBeforeCompile = (shader, renderer) => {
        finish(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_physical_fragment>',
          `totalEmissiveRadiance*=${gain.toFixed(3)};\n#include <lights_physical_fragment>`,
        );
      };
      material.customProgramCacheKey = () =>
        previousKey + '-lockdown-emission-' + gain;
    }
    maps = createHelionCeramicMaps(view?.renderer, [
      concrete,
      stone,
      plaster,
      recess,
    ]);
    await maps.ready;
    const metricUV = (geometry) => {
      const p = geometry.attributes.position,
        n = geometry.attributes.normal,
        uv = [];
      for (let i = 0; i < p.count; i++) {
        const x = Math.abs(n.getX(i)),
          y = Math.abs(n.getY(i)),
          z = Math.abs(n.getZ(i));
        uv.push(
          x > y && x > z ? p.getZ(i) : p.getX(i),
          y >= x && y >= z ? p.getZ(i) : p.getY(i),
        );
      }
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      return geometry;
    };
    const add = (
      geometry,
      material,
      position = new T.Vector3(),
      quaternion = new T.Quaternion(),
      name = '',
    ) => {
      geometry.applyMatrix4(
        new T.Matrix4().compose(position, quaternion, new T.Vector3(1, 1, 1)),
      );
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push(geometry);
      return name;
    };
    const box = (size, position, material, quaternion = new T.Quaternion()) => {
      const capped =
        [concrete, stone].includes(material) &&
        size[1] <= 4 &&
        size[1] > 0.3 &&
        size[0] >= 15 &&
        size[2] >= 6 &&
        layout.nearest(position[0], position[2]).distance < 160;
      const geometry = capped
        ? new RoundedBoxGeometry(...size, 1, Math.min(0.11, size[1] * 0.12))
        : new T.BoxGeometry(...size);
      return add(
        metricUV(geometry),
        material,
        new T.Vector3(...position),
        quaternion,
      );
    };
    const local = (record, point) =>
      new T.Vector3(...point)
        .applyQuaternion(record.quaternion)
        .add(record.position);
    const localBox = (record, size, point, material) =>
      box(size, local(record, point).toArray(), material, record.quaternion);
    const beam = (a, b, width, material) => {
      const delta = b.clone().sub(a),
        q = new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          delta.clone().normalize(),
        );
      box(
        [width, delta.length(), width],
        a.clone().add(b).multiplyScalar(0.5).toArray(),
        material,
        q,
      );
    };
    const pane = (record, width, height, point, material, turn = Math.PI) => {
      const q = record.quaternion
        .clone()
        .multiply(new T.Quaternion().setFromAxisAngle(WORLD_UP, turn));
      add(
        new T.PlaneGeometry(width, height),
        material,
        local(record, point),
        q,
      );
    };
    const workFixture = (
      record,
      point,
      {
        power = 1700,
        radius = 120,
        width = 6,
        color = '#ffd4a3',
        priority = false,
      } = {},
    ) => {
      localBox(record, [width + 1, 0.65, 1.8], point, iron);
      localBox(
        record,
        [width, 0.16, 1.15],
        [point[0], point[1] - 0.39, point[2]],
        workLight,
      );
      fixtures.push({
        position: local(record, [point[0], point[1] - 1.6, point[2]]),
        power,
        radius,
        color,
        priority,
      });
    };
    function pitchedRoof(record, width, depth, rise, y) {
      const points = [
        [-width / 2, 0, -depth / 2],
        [width / 2, 0, -depth / 2],
        [width / 2, 0, depth / 2],
        [-width / 2, 0, depth / 2],
        [0, rise, -depth / 2],
        [0, rise, depth / 2],
      ];
      const indices = [
        0, 4, 1, 3, 2, 5, 0, 3, 5, 0, 5, 4, 1, 4, 5, 1, 5, 2, 0, 1, 2, 0, 2, 3,
      ];
      const g = new T.BufferGeometry();
      g.setAttribute(
        'position',
        new T.Float32BufferAttribute(points.flat(), 3),
      );
      g.setIndex(indices);
      const flat = g.toNonIndexed();
      g.dispose();
      flat.computeVertexNormals();
      add(metricUV(flat), roof, local(record, [0, y, 0]), record.quaternion);
    }
    function arch(width, height, depth, record, point, material) {
      const w = width / 2,
        leg = height * 0.45,
        rise = height - leg,
        t = Math.max(0.75, width * 0.08),
        shape = new T.Shape();
      shape.moveTo(-w, 0);
      shape.lineTo(-w, leg);
      for (let i = 1; i <= 16; i++) {
        const angle = Math.PI - (i / 16) * Math.PI;
        shape.lineTo(Math.cos(angle) * w, leg + Math.sin(angle) * rise);
      }
      shape.lineTo(w, 0);
      shape.lineTo(w - t, 0);
      shape.lineTo(w - t, leg);
      for (let i = 1; i <= 16; i++) {
        const angle = (i / 16) * Math.PI;
        shape.lineTo(
          Math.cos(angle) * (w - t),
          leg + Math.sin(angle) * (rise - t),
        );
      }
      shape.lineTo(-w + t, 0);
      shape.closePath();
      const g = new T.ExtrudeGeometry(shape, {
        depth,
        steps: 1,
        bevelEnabled: width > 40,
        bevelThickness: 0.11,
        bevelSize: 0.1,
        bevelSegments: 2,
        curveSegments: 16,
      });
      g.translate(0, 0, -depth / 2);
      add(metricUV(g), material, local(record, point), record.quaternion);
    }
    // One continuous carved gorge supports all districts. The racing envelope
    // is depressed below the road; banks then rise into occupied terraces.
    const terrainBounds = layout.bounds.clone().expandByScalar(650),
      width = terrainBounds.max.x - terrainBounds.min.x,
      depth = terrainBounds.max.z - terrainBounds.min.z;
    const terrain = new T.PlaneGeometry(
      width,
      depth,
      Math.ceil(width / 18),
      Math.ceil(depth / 18),
    );
    terrain.rotateX(-Math.PI / 2);
    terrain.translate(
      (terrainBounds.min.x + terrainBounds.max.x) / 2,
      0,
      (terrainBounds.min.z + terrainBounds.max.z) / 2,
    );
    const tp = terrain.attributes.position;
    for (let i = 0; i < tp.count; i++)
      tp.setY(i, layout.terrainHeight(tp.getX(i), tp.getZ(i)));
    terrain.computeVertexNormals();
    add(metricUV(terrain), rock);
    function house(record) {
      const { width: w, depth: d, height: h, ground, position } = record,
        wall = record.style === 0 ? plaster : brick;
      const corners = [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
      ].map(([x, z]) => local(record, [x, 0, z]));
      const bottom =
          Math.min(
            ground,
            ...corners.map((p) => layout.terrainHeight(p.x, p.z)),
          ) - 5,
        footing = Math.max(4, position.y - bottom);
      if (record.urban) {
        const recess = 13,
          front = -d / 2;
        // The inhabited lower masonry is the support, with actual open
        // gallery depth. A retained uphill core stops behind these rooms.
        localBox(
          record,
          [w + 3, footing, d - recess],
          [0, -footing / 2, recess / 2],
          stone,
        );
        const rows = Math.max(4, Math.ceil(footing / 3.8)),
          bays = Math.max(4, Math.round(w / 9)),
          pitch = w / bays;
        for (let row = 0; row < rows; row++) {
          const y = -row * 3.8;
          localBox(
            record,
            [w + 2, 0.42, recess + 3],
            [0, y - 0.2, front + recess / 2],
            concrete,
          );
          for (let bay = 0; bay <= bays; bay++)
            localBox(
              record,
              [1.5, 3.8, 11],
              [(-bays / 2 + bay) * pitch, y - 1.9, front + 5.2],
              brick,
            );
          for (let bay = 0; bay < bays; bay++) {
            const x = (-bays / 2 + bay + 0.5) * pitch;
            if (row % 4 === 1) {
              localBox(
                record,
                [pitch - 1.5, 3.2, 1.1],
                [x, y - 1.8, front + 11.5],
                brick,
              );
              pane(
                record,
                pitch - 2.9,
                2.6,
                [x, y - 1.7, front + 10.9],
                (row + bay) % 3 ? amber : glass,
              );
              localBox(
                record,
                [pitch - 1.5, 0.12, 0.16],
                [x, y - 2.5, front - 0.7],
                iron,
              );
            } else {
              localBox(
                record,
                [pitch - 1.5, 0.6, 3],
                [x, y - 0.3, front + 2],
                brick,
              );
              localBox(
                record,
                [pitch - 1.5, 0.85, 3],
                [x, y - 3.35, front + 2],
                brick,
              );
              pane(
                record,
                pitch - 3,
                2.1,
                [x, y - 1.8, front + 3.6],
                (row + bay) % 4 ? amber : glass,
              );
            }
          }
        }
        localBox(record, [w + 4, 1, 24], [0, 0.1, front - 5], concrete);
        for (let j = 0; j < 6; j++)
          localBox(
            record,
            [0.16, 1.3, 0.16],
            [((-2.5 + j) * w) / 6, 0.8, front - 16.4],
            iron,
          );
        localBox(record, [w + 2, 0.14, 0.16], [0, 1.45, front - 16.4], iron);
      } else
        localBox(record, [w + 5, footing, d + 5], [0, -footing / 2, 0], stone);
      localBox(record, [76, 3.5, 15], [0, -1.7, -d / 2 - 5], concrete);
      localBox(record, [w, h, d - 2], [0, h / 2, 1], wall);
      const columns = Math.max(4, Math.floor(w / 7)),
        bay = w / columns,
        floors = Math.floor((h - 8) / 5.6);
      for (let c = 0; c < columns; c++) {
        const x = -w / 2 + bay * (c + 0.5);
        arch(
          bay,
          7.4,
          1.8,
          record,
          [x, 0, -d / 2 - 0.2],
          record.style === 0 ? stone : brick,
        );
        pane(
          record,
          bay - 1.4,
          5.1,
          [x, 3.05, -d / 2 + 0.65],
          (c + record.row) % 3 ? amber : glass,
        );
        for (let floor = 0; floor < floors; floor++)
          pane(
            record,
            bay - 1.3,
            3.6,
            [x, 10.4 + floor * 5.6, -d / 2 + 0.45],
            (c + floor + record.row) % 5 === 0
              ? glass
              : floor % 3 === 0
                ? pale
                : amber,
          );
      }
      for (let c = 0; c <= columns; c++)
        localBox(
          record,
          [0.8, h - 7, 1.8],
          [-w / 2 + c * bay, (h + 7) / 2, -d / 2],
          record.style === 0 ? concrete : brick,
        );
      for (let floor = 0; floor <= floors; floor++)
        localBox(record, [w, 1.35, 1.6], [0, 8 + floor * 5.6, -d / 2], wall);
      for (const side of [-1, 1]) {
        localBox(
          record,
          [1.4, h, 2],
          [side * (w / 2 - 0.4), h / 2, -d / 2],
          concrete,
        );
        for (let floor = 0; floor < floors; floor++)
          for (let bayIndex = 0; bayIndex < 4; bayIndex++)
            pane(
              record,
              3.6,
              3.4,
              [
                side * (w / 2 + 0.04),
                10.3 + floor * 5.6,
                -d / 2 + 7 + (bayIndex * (d - 12)) / 4,
              ],
              (floor + bayIndex) % 3 ? amber : glass,
              (side * Math.PI) / 2,
            );
      }
      for (let floor = 0; floor < floors; floor++)
        for (let c = 0; c < columns; c++) {
          const x = -w / 2 + bay * (c + 0.5);
          pane(
            record,
            bay - 1.5,
            3.3,
            [x, 10.4 + floor * 5.6, d / 2 + 0.05],
            (floor + c) % 4 ? amber : glass,
            0,
          );
        }
      for (let floor = 0; floor <= floors; floor++)
        localBox(
          record,
          [w, 0.65, 0.7],
          [0, 8 + floor * 5.6, d / 2 + 0.35],
          wall,
        );
      localBox(record, [w + 2.6, 1.35, d + 2.2], [0, h + 0.1, 0], concrete);
      pitchedRoof(record, w + 1.8, d + 1.8, 5.5 + record.style * 1.6, h + 0.8);
      if (record.style !== 0)
        for (const x of [-w * 0.28, w * 0.28])
          localBox(record, [2.2, 6.8, 2.8], [x, h + 5.6, d * 0.18], brick);
      if (record.row === 0) {
        localBox(record, [w + 0.8, 0.8, 3.7], [0, 19, -d / 2 - 1.5], concrete);
        localBox(record, [w + 0.5, 0.15, 0.2], [0, 20.2, -d / 2 - 3.15], iron);
        for (let c = 0; c <= columns; c++)
          localBox(
            record,
            [0.16, 1.25, 0.18],
            [-w / 2 + c * bay, 19.6, -d / 2 - 3.15],
            iron,
          );
      }
    }
    layout.buildings.forEach(house);
    // Linked occupied terraces: sheltered cross-courts connect neighbouring
    // plots, and broad stairs reach the municipal road without entering it.
    for (const building of layout.buildings.filter((b) => b.urban)) {
      const f = layout.streetFrame(building.distance, building.side),
        record = {
          position: f.position.clone().setY(0),
          quaternion: f.quaternion,
        };
      const top = building.position.y,
        road = f.position.y - 1.5,
        start = 34,
        end = 102 - building.depth / 2 - 7,
        steps = Math.max(4, Math.ceil((top - road) / 0.18));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        localBox(
          record,
          [7, 0.26, (end - start) / steps + 0.08],
          [
            building.width * 0.34,
            T.MathUtils.lerp(road, top, t),
            T.MathUtils.lerp(start, end, t),
          ],
          concrete,
        );
      }
      for (const side of [-1, 1])
        handrail(
          record,
          [building.width * 0.34 + side * 3.4, road, start],
          [building.width * 0.34 + side * 3.4, top, end],
        );
      localBox(
        building,
        [building.width + 26, 1.2, 17],
        [0, -0.5, -building.depth / 2 - 7],
        stone,
      );
      for (const x of [-building.width * 0.43, building.width * 0.43])
        localBox(
          building,
          [2.4, 9, 2.4],
          [x, 3.9, -building.depth / 2 - 8],
          brick,
        );
      // Unequal open arcade roofs and public galleries replace a blank gap
      // between detached upper blocks; the main street stays visibly clear.
      if (building.style !== 0) {
        workFixture(
          building,
          [-building.width * 0.17, 7, -building.depth / 2 - 7],
          { power: 1000, radius: 95, width: 4 },
        );
        localBox(
          building,
          [building.width * 0.55, 1.1, 12],
          [-building.width * 0.2, 7.8, -building.depth / 2 - 7],
          roof,
        );
        for (let bay = 0; bay < 4; bay++)
          arch(
            6.4,
            7,
            1.4,
            building,
            [-building.width * 0.43 + bay * 7, 0, -building.depth / 2 - 12],
            stone,
          );
      }
    }
    const turbines = [];
    for (const hall of layout.halls) {
      const { width: w, depth: d, height: h } = hall,
        footing = Math.max(8, hall.position.y - hall.ground + 10);
      localBox(hall, [w + 16, footing, d + 15], [0, -footing / 2, 0], stone);
      localBox(hall, [w, h, d - 9], [0, h / 2, 4.5], brick);
      for (const x of [-w / 2, w / 2])
        localBox(hall, [7, h + 8, d + 3], [x, (h + 8) / 2, 0], concrete);
      for (const x of hall.hero ? [-54, 0, 54] : [-31, 31]) {
        arch(49, 58, 5.5, hall, [x, 3, -d / 2], stone);
        pane(hall, 41, 40, [x, 27, -d / 2 + 3], pale);
      }
      for (const y of [5, 64, h - 1])
        localBox(hall, [w + 5, 3, 6], [0, y, -d / 2], concrete);
      localBox(hall, [w + 9, 2.3, d + 10], [0, h + 1.2, 0], concrete);
      pitchedRoof(hall, w + 7, d + 8, 12, h + 2.4);
      localBox(hall, [w * 0.64, 7, 12], [0, h + 13, 0], iron);
      pitchedRoof(hall, w * 0.66, 15, 4, h + 16.5);
      const center = local(hall, [-28, 31, -d / 2 - 3]),
        axis = new T.Vector3(0, 0, -1).applyQuaternion(hall.quaternion);
      const ring = new T.TorusGeometry(21, 2.8, 12, 64);
      add(ring, oxide, center, hall.quaternion);
      const sleeve = new T.CylinderGeometry(19, 19, 8, 48, 1, true);
      sleeve.rotateX(Math.PI / 2);
      add(
        metricUV(sleeve),
        iron,
        center.clone().addScaledVector(axis, -3),
        hall.quaternion,
      );
      turbines.push({
        p: center.toArray(),
        axis: axis.toArray(),
        radius: 18.5,
        distance: hall.distance,
      });
      for (const x of [-w * 0.34, w * 0.34]) {
        localBox(hall, [12, 46, 14], [x, h + 17, d * 0.3], brick);
        localBox(hall, [14, 2, 16], [x, h + 40, d * 0.3], stone);
      }
      for (let bay = 0; bay < 8; bay++)
        pane(hall, 8, 4, [(-3.5 + bay) * 12, h + 13, -7], amber);
    }
    // Grounded piers reach the raised route. The inverted reach is carried by
    // its continuous bridge girder, leaving the driving envelope unobstructed.
    for (let distance = 25; distance < track.length; distance += 84) {
      if (track.sample(distance).up.y < 0.5) continue;
      const groundFrame = layout.streetFrame(distance, 1),
        f = {
          ...groundFrame,
          position: track.sample(distance).position,
        };
      for (const side of [-1, 1]) {
        const p = f.position.clone().addScaledVector(f.out, side * 27),
          ground = layout.terrainHeight(p.x, p.z),
          top = f.position.y - 6.8;
        if (top - ground < 5) continue;
        const h = top - ground;
        box([5.5, h, 7], [p.x, ground + h / 2, p.z], stone, f.quaternion);
        box([10, 3.2, 11], [p.x, ground + 1.6, p.z], concrete, f.quaternion);
      }
    }
    // The municipal street crosses the course, not along it: a full spandrel
    // carries the upper street and a rooted control wing seats against one pier.
    for (const fraction of [0.12, 0.73]) {
      const f = (track.groundSample ?? track.sample)(track.length * fraction),
        right = new T.Vector3(f.right.x, 0, f.right.z).normalize(),
        forward = new T.Vector3().crossVectors(right, WORLD_UP).normalize();
      const quaternion = new T.Quaternion().setFromRotationMatrix(
          new T.Matrix4().makeBasis(right, WORLD_UP, forward),
        ),
        record = { position: f.position, quaternion };
      const shape = new T.Shape();
      shape.moveTo(-60, 0);
      shape.lineTo(-60, 68);
      shape.lineTo(60, 68);
      shape.lineTo(60, 0);
      shape.lineTo(43.7, 0);
      shape.lineTo(43.7, 39.7);
      for (let i = 1; i <= 32; i++) {
        const angle = (i / 32) * Math.PI;
        shape.lineTo(Math.cos(angle) * 43.7, 39.7 + Math.sin(angle) * 17);
      }
      shape.lineTo(-43.7, 0);
      shape.closePath();
      const spandrel = new T.ExtrudeGeometry(shape, {
        depth: 24,
        steps: 1,
        bevelEnabled: false,
      });
      spandrel.translate(0, 0, -12);
      add(metricUV(spandrel), stone, record.position, quaternion);
      localBox(record, [125, 4.5, 31], [0, 69.5, 0], concrete);
      for (const side of [-1, 1]) {
        const footing = local(record, [side * 52, -16, 0]),
          ground = layout.terrainHeight(footing.x, footing.z),
          height = Math.max(5, f.position.y - ground);
        localBox(record, [18, height, 31], [side * 52, -height / 2, 0], stone);
      }
      const position = local(record, [-79, -16, 0]);
      const controlHeight = fraction < 0.2 ? 84 : 63;
      house({
        position,
        quaternion,
        width: 35,
        depth: 44,
        height: controlHeight,
        ground: layout.terrainHeight(position.x, position.z),
        row: 1,
        style: fraction < 0.2 ? 1 : 0,
      });
      if (fraction < 0.2) {
        const watch = { position, quaternion };
        localBox(watch, [42, 2.6, 49], [0, 91, 0], stone);
        localBox(watch, [37, 12, 40], [0, 98, 2], brick);
        for (const x of [-17, -8, 1, 10, 19]) {
          localBox(watch, [1.5, 11, 3], [x, 98, -20], concrete);
          pane(watch, 6.4, 8, [x - 4.4, 98, -20.2], pale);
        }
        localBox(watch, [44, 1.7, 51], [0, 105, 0], concrete);
        pitchedRoof(watch, 45, 52, 7, 106);
      }
      localBox(record, [21, 4, 27], [-63, 48, 0], stone);
      for (let rail = -54; rail <= 54; rail += 6)
        localBox(record, [0.24, 3.4, 0.3], [rail, 73, -15], iron);
      for (const side of [-1, 1])
        localBox(record, [124, 0.3, 0.3], [0, 74.6, side * 15], iron);
    }
    for (const [index, z] of layout.splits.entries()) {
      const waterY = [46, 77][index],
        bottom = [19, 46][index],
        x = layout.riverX(z);
      box([247, 11, 24], [x, waterY - 6, z + 8], stone);
      for (let pier = -3; pier <= 3; pier++) {
        const px = x + pier * 35;
        box(
          [7, waterY - bottom + 31, 24],
          [px, bottom + (waterY - bottom + 31) / 2, z + 3],
          concrete,
        );
        box([13, 6, 19], [px, waterY + 27, z + 3], iron);
        box(
          [4, waterY - bottom - 2, 2],
          [px + 8, (waterY + bottom) / 2, z + 11],
          oxide,
        );
      }
      box([245, 4, 24], [x, waterY + 23, z + 3], concrete);
      for (const side of [-1, 1]) {
        const q = new T.Quaternion(),
          record = {
            position: new T.Vector3(x + side * 144, waterY + 20, z + 5),
            quaternion: q,
          };
        localBox(record, [30, 24, 33], [0, 12, 0], brick);
        pitchedRoof(record, 34, 37, 7, 24);
        for (let col = 0; col < 3; col++)
          pane(record, 5.5, 7, [-10 + col * 10, 12, -16.6], amber);
      }
    }
    // Reservoir inspection level: a contained water staircase, actual massive
    // abutments and a generating gallery are composed beside the racing view.
    const hydro = layout.hydro;
    const hframe = (distance) => {
      const f = (track.groundSample ?? track.sample)(distance),
        right = new T.Vector3(f.right.x, 0, f.right.z).normalize(),
        forward = new T.Vector3().crossVectors(right, WORLD_UP).normalize();
      return {
        position: f.position,
        right,
        forward,
        distance,
        bankedRight: f.right,
      };
    };
    const world = (f, x, y, z = 0) =>
      f.position
        .clone()
        .addScaledVector(f.right, x)
        .addScaledVector(f.forward, z)
        .setY(y);
    function wallStrip(start, end, a, b, bottom, topAt, name) {
      const p = [],
        idx = [],
        steps = Math.ceil((end - start) / 16);
      for (let i = 0; i <= steps; i++) {
        const distance = T.MathUtils.lerp(start, end, i / steps),
          f = hframe(distance),
          top = typeof topAt === 'function' ? topAt(f) : topAt,
          near = typeof a === 'function' ? a(distance) : a,
          far = typeof b === 'function' ? b(distance) : b;
        for (const [x, y] of [
          [near, bottom],
          [near, top],
          [far, top],
          [far, bottom],
        ])
          p.push(...world(f, x, y).toArray());
      }
      for (let i = 0; i < steps; i++)
        for (let face = 0; face < 3; face++) {
          const q = i * 4 + face;
          idx.push(q, q + 4, q + 1, q + 1, q + 4, q + 5);
        }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      add(metricUV(g), concrete);
      return name;
    }
    wallStrip(
      hydro.start,
      hydro.dam,
      44,
      58,
      96,
      (f) => f.position.y - 8,
      'roadside reservoir abutment',
    );
    wallStrip(
      hydro.start,
      hydro.dam,
      286,
      302,
      96,
      128,
      'outer reservoir containment',
    );
    wallStrip(
      hydro.dam,
      hydro.end,
      56,
      72,
      34,
      66,
      'tailrace inspection retaining wall',
    );
    wallStrip(
      hydro.dam,
      hydro.end,
      255,
      270,
      34,
      66,
      'tailrace far retaining wall',
    );
    for (let distance = hydro.start; distance < hydro.dam; distance += 52) {
      const f = hframe(distance),
        q = new T.Quaternion().setFromRotationMatrix(
          new T.Matrix4().makeBasis(f.right, WORLD_UP, f.forward),
        );
      box([22, 12, 10], world(f, 52, f.position.y - 15).toArray(), stone, q);
      box([29, 2.5, 13], world(f, 42, f.position.y - 6).toArray(), concrete, q);
      box([0.5, 3, 13], world(f, 55, f.position.y - 3.3).toArray(), iron, q);
    }
    const inlet = hframe(hydro.start),
      inletQ = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(inlet.right, WORLD_UP, inlet.forward),
      );
    box([253, 30, 16], world(inlet, 171, 113).toArray(), stone, inletQ);
    const dam = hframe(hydro.dam),
      damQ = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(dam.right, WORLD_UP, dam.forward),
      );
    const damRecord = {
      position: dam.position.clone().setY(0),
      quaternion: damQ,
    };
    localBox(damRecord, [251, 20, 43], [170, 50, 8], stone);
    for (let bay = 0; bay < 6; bay++) {
      const x = 64 + bay * 40;
      localBox(damRecord, [13, 81, 33], [x, 81.5, 0], concrete);
      for (const y of [hydro.lowerY, hydro.upperY])
        localBox(damRecord, [13.15, 1.6, 33.15], [x, y + 0.15, 0], splash);
      localBox(damRecord, [23, 18, 58], [x, 46, 13], stone);
      localBox(damRecord, [10, 26, 8], [x, 138, 0], iron);
      localBox(damRecord, [27, 2.8, 16], [x + 20, 118, -4], oxide);
    }
    localBox(damRecord, [252, 5, 22], [170, 127, -2], concrete);
    localBox(damRecord, [252, 1.3, 4], [170, 133, -12], iron);
    // Asymmetric lifting tower carries its own hoist, diagonal bracing and a
    // long bridge beam; no floating upper apartment or detached prop rotor.
    for (const x of [75, 97]) {
      localBox(damRecord, [6, 88, 10], [x, 171, 0], iron);
      localBox(damRecord, [20, 7, 22], [x, 127, 0], concrete);
      for (let y = 139; y < 210; y += 20) {
        localBox(damRecord, [25, 2.2, 11], [86, y, 0], iron);
      }
    }
    function pressureRun(points, radius) {
      const curve = new T.CatmullRomCurve3(points);
      add(metricUV(new T.TubeGeometry(curve, 48, radius, 24, false)), pressure);
      for (const t of [0.2, 0.61, 0.86]) {
        const center = curve.getPointAt(t),
          axis = curve.getTangentAt(t).normalize(),
          q = new T.Quaternion().setFromUnitVectors(WORLD_UP, axis);
        const profile = [
          [radius, -0.42],
          [radius * 1.13, -0.42],
          [radius * 1.18, -0.25],
          [radius * 1.18, 0.25],
          [radius * 1.13, 0.42],
          [radius, 0.42],
        ].map(([r, y]) => new T.Vector2(r, y));
        add(metricUV(new T.LatheGeometry(profile, 48)), alloy, center, q);
        for (const side of [-1, 1]) {
          const gasket = new T.CylinderGeometry(
            radius * 1.075,
            radius * 1.075,
            0.15,
            48,
            1,
            true,
          );
          add(
            metricUV(gasket),
            seal,
            center.clone().addScaledVector(axis, side * 0.45),
            q,
          );
        }
        const across = new T.Vector3()
            .crossVectors(
              axis,
              Math.abs(axis.y) > 0.9 ? new T.Vector3(1, 0, 0) : WORLD_UP,
            )
            .normalize(),
          other = new T.Vector3().crossVectors(axis, across).normalize();
        for (let bolt = 0; bolt < 8; bolt++) {
          const angle = (bolt / 8) * Math.PI * 2,
            point = center
              .clone()
              .addScaledVector(across, Math.cos(angle) * radius * 1.08)
              .addScaledVector(other, Math.sin(angle) * radius * 1.08)
              .addScaledVector(axis, 0.48);
          add(
            metricUV(new T.CylinderGeometry(0.16, 0.16, 0.18, 6)),
            iron,
            point,
            q,
          );
        }
      }
    }
    function handrail(record, start, end) {
      const a = local(record, start),
        b = local(record, end),
        up = new T.Vector3(0, 1.1, 0);
      beam(a.clone().add(up), b.clone().add(up), 0.09, iron);
      const count = Math.max(1, Math.ceil(a.distanceTo(b) / 2.4));
      for (let i = 0; i <= count; i++) {
        const foot = a.clone().lerp(b, i / count);
        box(
          [0.085, 1.1, 0.085],
          foot.add(new T.Vector3(0, 0.55, 0)).toArray(),
          iron,
        );
      }
    }
    function maintenanceDoor(record, x, y, z) {
      localBox(record, [1.9, 3.2, 0.45], [x, y + 1.6, z], iron);
      localBox(record, [1.45, 2.72, 0.15], [x, y + 1.42, z - 0.28], pressure);
      pane(record, 0.48, 1.08, [x, y + 1.98, z - 0.37], glass);
      localBox(
        record,
        [0.07, 0.34, 0.14],
        [x + 0.49, y + 1.19, z - 0.41],
        alloy,
      );
      localBox(record, [2.3, 0.2, 1.1], [x, y + 0.1, z - 0.5], concrete);
    }
    for (let y = 137; y < 200; y += 21) {
      beam(
        local(damRecord, [75, y, 0]),
        local(damRecord, [97, y + 21, 0]),
        2.1,
        oxide,
      );
      beam(
        local(damRecord, [97, y, 0]),
        local(damRecord, [75, y + 21, 0]),
        2.1,
        oxide,
      );
    }
    localBox(damRecord, [128, 7, 15], [133, 212, 0], iron);
    localBox(damRecord, [23, 13, 22], [91, 222, 0], oxide);
    for (const x of [125, 153, 181])
      localBox(damRecord, [0.8, 85, 0.8], [x, 168, 0], iron);
    for (const x of [75, 97])
      for (const z of [-4.5, 4.5])
        localBox(damRecord, [1.6, 12, 1.6], [x, 232, z], iron);
    // A connected low receiving gallery gives the weir a working base rather
    // than leaving the hydraulic machinery on an empty landscape mound.
    localBox(damRecord, [240, 14, 26], [170, 68, 31], brick);
    for (let bay = 0; bay < 10; bay++) {
      arch(19, 12, 3, damRecord, [62 + bay * 24, 61, 16], stone);
      pane(damRecord, 13, 7, [62 + bay * 24, 66, 17.2], amber);
    }

    // The upper road is the inspection level of a recessed generating gallery.
    // Its deep rotor bays and rooted pressure mains face the actual approach;
    // the reservoir and lifting weir are the other side of the same works.
    for (
      let distance = track.length * 0.225;
      distance < track.length * 0.309;
      distance += 50
    ) {
      const f = layout.streetFrame(distance, -1),
        record = {
          position: f.position
            .clone()
            .addScaledVector(f.out, 82)
            .setY(f.position.y - 12),
          quaternion: f.quaternion,
        };
      workFixture(record, [0, 45, -14], {
        power: 2600,
        radius: 150,
        width: 11,
      });
      const floor = record.position.y,
        ground = layout.terrainHeight(record.position.x, record.position.z),
        roofHeight = [71, 84, 64, 78][
          Math.round((distance - track.length * 0.225) / 50) % 4
        ];
      const foundation = Math.max(8, floor - ground + 8),
        headwall = distance < track.length * 0.225 + 1;
      localBox(
        record,
        [headwall ? 37 : 55, foundation, 70],
        [headwall ? 8 : 0, -foundation / 2, 3],
        stone,
      );
      localBox(
        record,
        [headwall ? 37 : 53, roofHeight, 40],
        [headwall ? 8 : 0, roofHeight / 2, 18],
        brick,
      );
      for (const x of headwall ? [25] : [-25, 25])
        localBox(record, [5, roofHeight, 65], [x, roofHeight / 2, 5], concrete);
      if (headwall) {
        const end = {
            position: local(record, [-31, 0, 3]),
            quaternion: record.quaternion
              .clone()
              .multiply(
                new T.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI / 2),
              ),
          },
          bottom = -foundation;
        // A single thick civil headwall, with true deep apertures into the
        // retained generating body. Its lower sluice belongs to the basin.
        const face = new T.Shape();
        face.moveTo(-39, bottom);
        face.lineTo(39, bottom);
        face.lineTo(39, 60);
        face.lineTo(16, 60);
        face.lineTo(16, 73);
        face.lineTo(-8, 73);
        face.lineTo(-8, 54);
        face.lineTo(-39, 54);
        face.closePath();
        const opening = (width, base, leg, rise) => {
          const hole = new T.Path(),
            half = width / 2;
          hole.moveTo(-half, base);
          hole.lineTo(half, base);
          hole.lineTo(half, base + leg);
          for (let i = 1; i <= 24; i++) {
            const angle = (i / 24) * Math.PI;
            hole.lineTo(
              Math.cos(angle) * half,
              base + leg + Math.sin(angle) * rise,
            );
          }
          hole.closePath();
          face.holes.push(hole);
        };
        opening(48, 6, 28, 12);
        opening(42, bottom + 11, 17, 7);
        const wall = new T.ExtrudeGeometry(face, {
          depth: 10,
          steps: 1,
          bevelEnabled: false,
        });
        wall.translate(0, 0, -5);
        add(metricUV(wall), concrete, end.position, end.quaternion);
        localBox(end, [47, 39, 1], [0, 25, 17], recess);
        localBox(end, [28, 29, 1.4], [-7, 20.5, 16], iron);
        for (const x of [-19, -11, -3])
          localBox(end, [1.2, 28, 2.2], [x, 20.5, 14.7], pressure);
        pane(end, 8, 14, [17, 24, 16.2], workRooms);
        localBox(end, [45, 1.2, 25], [0, 6, 6], stone);
        localBox(end, [43, 3, 13], [0, 47, 2], iron);
        localBox(end, [39, 20, 1.8], [0, bottom + 24, 16], oxide);
        for (const x of [-16, -8, 0, 8, 16])
          localBox(end, [1.1, 20, 2.7], [x, bottom + 24, 14.2], iron);
        for (const x of [-23, 23])
          localBox(end, [4.5, 30, 23], [x, bottom + 22, 5], stone);
        localBox(end, [47, 4, 27], [0, bottom + 39, 5], stone);
        // Unequal tapered counterforts transfer the tall head to deep basin
        // footings. Capped returns step around the apertures, not across them.
        for (const [x, top, width] of [
          [-34, 52, 10],
          [33, 61, 12],
        ]) {
          const section = new T.Shape(),
            profile = [
              [-4, top],
              [6, top],
              [6, bottom],
              [-25, bottom],
              [-18, bottom + 24],
              [-4, top - 19],
            ];
          profile.forEach(([z, y], i) =>
            i ? section.lineTo(-z, y) : section.moveTo(-z, y),
          );
          section.closePath();
          const buttress = new T.ExtrudeGeometry(section, {
            depth: width,
            steps: 1,
            bevelEnabled: false,
          });
          buttress.translate(0, 0, -width / 2);
          buttress.rotateY(Math.PI / 2);
          buttress.translate(x, 0, 0);
          add(metricUV(buttress), stone, end.position, end.quaternion);
          localBox(end, [width + 4, 2.8, 19], [x, top + 1.2, -2], concrete);
        }
        localBox(end, [76, 3.2, 17], [0, 0, -2], stone);
        for (const [x, y, w] of [
          [-23, 55, 32],
          [5, 74, 28],
          [28, 62, 24],
        ])
          localBox(end, [w, 2.4, 15], [x, y, -1], stone);
        workFixture(end, [0, 42, 8], {
          power: 4200,
          radius: 160,
          width: 12,
          priority: true,
        });
      }
      arch(45, 56, 9, record, [0, 0, -24], stone);
      localBox(record, [54, 5, 16], [0, 58, -22], concrete);
      localBox(record, [56, 3.5, 72], [0, roofHeight + 1, 4], stone);
      pitchedRoof(
        { ...record, position: local(record, [0, 0, 4]) },
        56,
        72,
        roofHeight > 75 ? 11 : 6,
        roofHeight + 3,
      );
      localBox(record, [39, 49, 1], [0, 25, -4], recess);
      pane(record, 37, 47, [0, 25, -6], glass);
      for (let bay = 0; bay < 5; bay++)
        pane(
          record,
          6.3,
          9,
          [(-2 + bay) * 9, roofHeight - 10, -5.2],
          bay % 2 ? amber : pale,
        );
      localBox(record, [54, 1.3, 7], [0, 61, -28], iron);
      for (let post = -24; post <= 24; post += 6)
        localBox(record, [0.3, 3.2, 0.35], [post, 63, -31], iron);
      if (Math.round(distance / 50) % 2 !== 0) {
        maintenanceDoor(record, 16.5, 11, -6.5);
        localBox(record, [10, 0.5, 18], [13.5, 10.75, -15], iron);
        for (const x of [8.5, 18.5])
          handrail(record, [x, 11, -24], [x, 11, -6]);
        for (const side of [-1, 1])
          handrail(
            record,
            [13.5 + side * 1.6, 11, -48],
            [13.5 + side * 1.6, 11, -24],
          );
        localBox(record, [3.2, 0.4, 24], [13.5, 10.8, -36], iron);
        const upper = 12 - 26 * f.right.y - 0.4,
          count = Math.max(4, Math.ceil(Math.abs(upper - 11) / 0.18));
        for (let i = 0; i < count; i++) {
          const t = (i + 0.5) / count;
          localBox(
            record,
            [3.2, 0.22, 8 / count + 0.06],
            [13.5, T.MathUtils.lerp(upper, 11, t), -56 + 8 * t],
            concrete,
          );
        }
        for (const side of [-1, 1])
          handrail(
            record,
            [13.5 + side * 1.6, upper, -56],
            [13.5 + side * 1.6, 11, -48],
          );
      }
      if (Math.round(distance / 50) % 2 === 0) {
        const center = local(record, [0, 25, -19]),
          axis = new T.Vector3(0, 0, -1).applyQuaternion(record.quaternion);
        add(
          new T.TorusGeometry(20.5, 2.2, 12, 56),
          oxide,
          center,
          record.quaternion,
        );
        const back = new T.CircleGeometry(18.4, 48);
        back.rotateY(Math.PI);
        add(
          back,
          iron,
          center.clone().addScaledVector(axis, -6),
          record.quaternion,
        );
        turbines.push({
          p: center.toArray(),
          axis: axis.toArray(),
          radius: 17.5,
          distance,
        });
        const roadFrame = hframe(distance),
          points = [
            [-90, f.position.y + 27],
            [-78, f.position.y + 14],
            [-68, f.position.y - 13],
            [-42, f.position.y - 23],
            [48, f.position.y - 23],
            [68, f.position.y - 33],
          ].map(([x, y]) => world(roadFrame, x, y));
        pressureRun(points, 3.5);
        localBox(record, [13, 14, 4], [0, 33, -3], stone);
      }
    }
    // The repeated turbine bays terminate at a clearly different process
    // destination: deep central machine hall, lower service range, asymmetric
    // intake header and an occupied control/stair wing. These replace the
    // final three identical gallery modules rather than extending the row.
    {
      const distance = track.length * 0.332,
        f = layout.streetFrame(distance, -1),
        record = {
          position: f.position
            .clone()
            .addScaledVector(f.out, 128)
            .setY(f.position.y - 12),
          quaternion: f.quaternion,
        };
      const foundation = Math.max(
        14,
        record.position.y -
          layout.terrainHeight(record.position.x, record.position.z) +
          12,
      );
      localBox(record, [174, foundation, 100], [0, -foundation / 2, 0], stone);
      // Back wall remains twenty-six metres behind the front arch. The
      // stepped process gallery has real sheltered floor depth and columns.
      localBox(record, [161, 101, 30], [0, 50.5, 32], brick);
      for (const x of [-77, -39, 39, 77])
        localBox(record, [7, 101, 80], [x, 50.5, 1], concrete);
      arch(78, 79, 10, record, [0, 1, -42], stone);
      pane(record, 65, 65, [0, 35, -15.1], glass);
      for (const y of [15, 31, 47]) {
        localBox(record, [68, 0.9, 19], [0, y, -7], iron);
        localBox(record, [67, 0.16, 0.15], [0, y + 1.3, -16.1], iron);
        for (let x = -30; x <= 30; x += 10)
          localBox(record, [0.18, 1.4, 0.18], [x, y + 0.65, -16], iron);
        for (let x = -27; x <= 27; x += 9)
          pane(record, 6.7, 8, [x, y + 5, -14.9], workRooms);
      }
      workFixture(record, [0, 69, -26], {
        power: 9000,
        radius: 240,
        width: 17,
        priority: true,
      });
      workFixture(record, [-56, 38, -34], {
        power: 2900,
        radius: 140,
        width: 11,
      });
      localBox(record, [85, 4.2, 92], [0, 103, 2], stone);
      pitchedRoof(
        { ...record, position: local(record, [0, 0, 2]) },
        86,
        94,
        15,
        105,
      );
      localBox(record, [61, 9, 54], [0, 122, 2], iron);
      pitchedRoof(
        { ...record, position: local(record, [0, 0, 2]) },
        64,
        58,
        6,
        127,
      );
      for (let x = -24; x <= 24; x += 8) {
        pane(record, 5.4, 5.2, [x, 122, -25.1], amber);
        pane(record, 5.4, 5.2, [x, 122, 29.1], pale, 0);
      }
      // Unequal occupied shoulders make the process identity legible before
      // the driver reaches the main hall, with a low dispatch range and a
      // narrow high control tower sharing the hall's foundations.
      courtRangeEarly(record, -78, -42, -42, 40, 58);
      courtRangeEarly(record, 43, 77, -42, 40, 83);
      const tower = {
        position: local(record, [58, 0, 11]),
        quaternion: record.quaternion,
      };
      localBox(tower, [31, 119, 43], [0, 59.5, 0], brick);
      for (let floor = 0; floor < 18; floor++)
        for (const x of [-9, 0, 9])
          pane(
            tower,
            5,
            3.5,
            [x, 14 + floor * 5.5, -21.6],
            floor % 4 ? amber : glass,
          );
      for (const x of [-16, 16])
        localBox(tower, [2.5, 123, 5], [x, 61.5, -20], concrete);
      localBox(tower, [41, 3, 53], [0, 123, 0], concrete);
      localBox(tower, [36, 14, 46], [0, 131, 0], iron);
      for (const x of [-13, -6.5, 0, 6.5, 13])
        pane(tower, 5.2, 10, [x, 131, -23.1], pale);
      localBox(tower, [43, 2, 55], [0, 139, 0], stone);
      pitchedRoof(tower, 45, 57, 7, 140);
      for (const x of [-65, -53]) {
        const points = [
          [x, 75, -33],
          [x, 77, -49],
          [x, 61, -62],
          [x, 25, -70],
          [x, -20, -85],
        ].map((p) => local(record, p));
        pressureRun(points, 4);
        localBox(record, [11, 14, 13], [x, 70, -33], stone);
      }
      localBox(record, [165, 2, 22], [0, 1, -54], concrete);
    }
    function courtRangeEarly(record, x0, x1, z0, z1, height) {
      const w = x1 - x0,
        d = z1 - z0,
        cx = (x0 + x1) / 2;
      localBox(record, [w, height, d - 12], [cx, height / 2, 6], brick);
      for (const x of [x0 + 2, x1 - 2])
        localBox(
          record,
          [4, height + 3, d],
          [x, (height + 3) / 2, 0],
          concrete,
        );
      arch(w - 5, Math.min(44, height - 8), 7, record, [cx, 1, z0], stone);
      pane(
        record,
        w - 13,
        Math.min(33, height - 16),
        [cx, Math.min(26, height / 2), z0 + 8],
        amber,
      );
      localBox(record, [w + 3, 2.2, d + 3], [cx, height + 1, 0], concrete);
      pitchedRoof(
        { ...record, position: local(record, [cx, 0, 0]) },
        w + 4,
        d + 4,
        7,
        height + 2.2,
      );
    }
    const intakeFrame = layout.streetFrame(track.length * 0.327, 1),
      intake = {
        position: intakeFrame.position
          .clone()
          .addScaledVector(intakeFrame.out, 85)
          .setY(115),
        quaternion: intakeFrame.quaternion,
      };
    for (const x of [-28, 28])
      localBox(intake, [9, 56, 40], [x, 28, 0], concrete);
    arch(53, 52, 8, intake, [0, 0, -18], stone);
    localBox(intake, [68, 5, 45], [0, 55, 0], concrete);
    for (const x of [-23, 23])
      localBox(intake, [3.4, 52, 4], [x, 26, -12], iron);
    localBox(intake, [43, 19, 3], [0, 37, -11], oxide);
    for (let x = -18; x <= 18; x += 6)
      localBox(intake, [0.8, 18, 1.2], [x, 37, -13], iron);
    workFixture(intake, [0, 30, -12], {
      power: 3800,
      radius: 165,
      width: 10,
      priority: true,
    });
    localBox(intake, [39, 14, 26], [0, 64, 0], brick);
    pitchedRoof(intake, 44, 31, 7, 71);
    for (let x = -12; x <= 12; x += 8)
      pane(intake, 5.2, 7, [x, 64, -13.1], amber);
    for (const x of [-24, 24]) localBox(intake, [5, 11, 11], [x, 75, 0], iron);

    // The lower lap is a working water-quarter, not a continuation of the
    // apartment skyline: low unequal ranges wrap occupied courts on real quays.
    let quayFrontages = 0;
    function courtRange(record, x0, x1, z0, z1, height) {
      const w = x1 - x0,
        d = z1 - z0,
        cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      localBox(record, [w, height, d - 4], [cx, height / 2, cz + 2], brick);
      const bays = Math.max(2, Math.round(w / 6.7)),
        pitch = w / bays,
        floors = Math.floor((height - 6) / 3.8);
      for (let bay = 0; bay < bays; bay++) {
        const x = x0 + (bay + 0.5) * pitch;
        arch(pitch, 5.5, 2.4, record, [x, 0, z0], stone);
        pane(
          record,
          pitch - 1.4,
          3.8,
          [x, 2.4, z0 + 1.25],
          bay % 3 ? amber : pale,
        );
        for (let floor = 0; floor < floors; floor++)
          pane(
            record,
            pitch - 1.3,
            2.55,
            [x, 7.5 + floor * 3.8, z0 + 1.2],
            (bay + floor) % 4 ? amber : glass,
          );
      }
      for (let bay = 0; bay <= bays; bay++)
        localBox(
          record,
          [0.85, height, 4.6],
          [x0 + bay * pitch, height / 2, z0 + 1.3],
          concrete,
        );
      for (let floor = 0; floor <= floors; floor++)
        localBox(
          record,
          [w, 0.72, 4.7],
          [cx, 5.7 + floor * 3.8, z0 + 1.4],
          brick,
        );
      localBox(
        record,
        [w + 1.6, 0.85, d + 1.2],
        [cx, height + 0.2, cz],
        concrete,
      );
      pitchedRoof(
        { ...record, position: local(record, [cx, 0, cz]) },
        w + 1.1,
        d + 1.1,
        3.9,
        height + 0.7,
      );
      for (const x of [x0 + 2.3, x1 - 2.3])
        localBox(record, [1.4, 4.1, 1.8], [x, height + 4, cz + 2], brick);
    }
    for (const quay of layout.quays) {
      wallStrip(
        quay.start,
        quay.end,
        26,
        38,
        quay.waterY - 12,
        (f) =>
          Math.min(f.position.y + f.bankedRight.y * 28 - 2, quay.waterY + 6),
        'inspection quay near retaining wall',
      );
      wallStrip(
        quay.start,
        quay.end,
        layout.quayFar,
        (s) => layout.quayFar(s) + 14,
        quay.waterY - 12,
        quay.waterY + 4,
        'occupied quay wall',
      );
      for (
        let distance = quay.start + 28;
        distance < quay.end - 25;
        distance += 82
      ) {
        const f = layout.streetFrame(distance, 1),
          record = {
            position: f.position
              .clone()
              .addScaledVector(f.out, layout.quayFar(distance) + 37)
              .setY(quay.waterY + 4),
            quaternion: f.quaternion,
          };
        if (!layout.clear(record.position, Math.hypot(78, 43) / 2)) continue;
        localBox(record, [83, 17, 48], [0, -8.5, 0], stone);
        localBox(record, [86, 1.1, 53], [0, 0.1, 0], concrete);
        courtRange(record, -39, 39, 7, 21.5, 24 + (quayFrontages % 3) * 3.8);
        courtRange(
          record,
          -39,
          -24,
          -21.5,
          7,
          20.5 + (quayFrontages % 2) * 3.8,
        );
        courtRange(record, 21, 39, -21.5, 7, 28.1);
        localBox(record, [43, 0.45, 31], [-1.5, 0.8, -7], stone);
        for (const side of [-1, 1]) {
          localBox(record, [2.7, 8, 2.7], [side * 24, 4, -21], iron);
          localBox(record, [4, 0.65, 4], [side * 24, 8, -21], roof);
        }
        for (let side = -1; side <= 1; side += 2)
          for (let floor = 0; floor < 4; floor++)
            for (let bay = 0; bay < 3; bay++)
              pane(
                record,
                3.8,
                2.5,
                [side < 0 ? -23.9 : 20.9, 7 + floor * 3.8, -16 + bay * 7],
                amber,
                side < 0 ? Math.PI / 2 : -Math.PI / 2,
              );
        workFixture(record, [-1.5, 8, 7], {
          power: 1400,
          radius: 120,
          width: 7,
        });
        quayFrontages++;
      }
      for (
        let distance = quay.start + 35;
        distance < quay.end - 20;
        distance += 146
      ) {
        const f = layout.streetFrame(distance, 1),
          record = {
            position: f.position.clone().setY(0),
            quaternion: f.quaternion,
          };
        const upper = f.position.y + f.right.y * 28 - 2,
          lower = quay.waterY + 4,
          count = Math.max(4, Math.ceil((upper - lower) / 0.28)),
          run = 38;
        for (let step = 0; step < count; step++) {
          const t = (step + 0.5) / count,
            y = T.MathUtils.lerp(upper, lower, t);
          localBox(
            record,
            [5.4, 0.32, run / count + 0.08],
            [0, y, 32 + t * run],
            concrete,
          );
        }
        for (const offset of [-2.75, 2.75]) {
          const a = local(record, [offset, upper + 1.1, 32]),
            b = local(record, [offset, lower + 1.1, 70]);
          beam(a, b, 0.14, iron);
        }
        for (const z of [32, 70])
          localBox(
            record,
            [5.8, 0.35, 2.8],
            [0, z === 32 ? upper - 0.17 : lower - 0.17, z],
            concrete,
          );
        for (const side of [-1, 1])
          for (let i = 0; i <= 7; i++) {
            const t = i / 7;
            localBox(
              record,
              [0.085, 1.1, 0.085],
              [
                side * 2.75,
                T.MathUtils.lerp(upper, lower, t) + 0.55,
                32 + t * 38,
              ],
              iron,
            );
          }
        for (const distanceOut of [46, 64]) {
          const t = (distanceOut - 32) / run,
            y = T.MathUtils.lerp(upper, lower, t),
            p = local(record, [0, 0, distanceOut]),
            ground = layout.terrainHeight(p.x, p.z),
            height = Math.max(2, y - ground);
          localBox(
            record,
            [2.1, height, 3.4],
            [0, ground + height / 2, distanceOut],
            stone,
          );
        }
      }
      for (const distance of [quay.start, quay.end]) {
        if (
          Math.abs(distance - layout.discharge.start) < 0.01 ||
          Math.abs(distance - layout.discharge.end) < 0.01
        )
          continue;
        const f = hframe(distance),
          q = new T.Quaternion().setFromRotationMatrix(
            new T.Matrix4().makeBasis(f.right, WORLD_UP, f.forward),
          ),
          record = { position: f.position.clone().setY(0), quaternion: q };
        const near = 38,
          far = layout.quayFar(distance),
          span = far - near,
          pierWidth = Math.min(8, span * 0.12 + 2);
        for (const x of [near, (near + far) / 2, far]) {
          localBox(
            record,
            [pierWidth, 24, 19],
            [x, quay.waterY + 2, 0],
            concrete,
          );
          localBox(record, [13, 5, 17], [x, quay.waterY + 16, 0], iron);
        }
        localBox(
          record,
          [span + 12, 3, 18],
          [(near + far) / 2, quay.waterY + 12, 0],
          concrete,
        );
        for (const t of [0.25, 0.75]) {
          const x = T.MathUtils.lerp(near, far, t),
            radius = Math.min(4.7, span / 12);
          localBox(
            record,
            [Math.max(2, span / 2 - pierWidth - 1), 9, 2],
            [x, quay.waterY - 1, -3],
            oxide,
          );
          const tube = new T.CylinderGeometry(radius, radius, 18, 28, 1, true);
          tube.rotateX(Math.PI / 2);
          add(
            metricUV(tube),
            iron,
            local(record, [x, quay.waterY - 1, 7]),
            record.quaternion,
          );
          add(
            new T.TorusGeometry(radius + 0.4, 0.42, 8, 32),
            oxide,
            local(record, [x, quay.waterY - 1, 16]),
            record.quaternion,
          );
        }
      }
    }

    // One actual hydraulic connection joins the existing upper-return and
    // sluice reaches. A pressure-fed head drops into a contained stilling
    // pocket; the whole control/discharge assembly sits beyond the road gutter.
    {
      const d = layout.discharge,
        f = hframe(d.station),
        q = new T.Quaternion().setFromRotationMatrix(
          new T.Matrix4().makeBasis(f.right, WORLD_UP, f.forward),
        ),
        record = { position: f.position.clone().setY(0), quaternion: q };
      wallStrip(
        d.start,
        d.station,
        26,
        38,
        d.lowerY - 12,
        d.lowerY + 6,
        'connected receiving near bank',
      );
      wallStrip(
        d.station,
        d.end,
        26,
        38,
        d.lowerY - 12,
        d.upperY + 6,
        'connected source near bank',
      );
      wallStrip(
        d.start,
        d.station,
        148,
        163,
        d.lowerY - 12,
        d.lowerY + 4,
        'receiving basin far bank',
      );
      wallStrip(
        d.station,
        d.end,
        148,
        163,
        d.lowerY - 12,
        d.upperY + 4,
        'upper discharge far bank',
      );
      localBox(record, [113, 7, 15], [93, d.lowerY - 6, 4], stone);
      localBox(record, [112, 2.4, 11], [93, d.sourceY - 1.2, 0.5], concrete);
      for (const [x, width] of [
        [38, 11],
        [76, 8],
        [114, 8],
        [151, 12],
      ]) {
        localBox(record, [width, 63, 23], [x, d.lowerY + 19.5, 4], stone);
        localBox(
          record,
          [width + 0.16, 1.7, 23.16],
          [x, d.lowerY + 0.2, 4],
          splash,
        );
        localBox(record, [width + 5, 3, 28], [x, d.sourceY + 13, 4], concrete);
        localBox(record, [3.5, 27, 5], [x, d.sourceY + 26, 3], iron);
        localBox(record, [width + 1, 5, 15], [x, d.sourceY + 40, 3], oxide);
      }
      // A single wide controlled opening and its smaller companion are open;
      // the far maintenance bay is closed, so it reads as working machinery.
      for (const [x, width] of [
        [57, 27],
        [95, 27],
        [132, 25],
      ]) {
        for (const edge of [-1, 1])
          localBox(
            record,
            [1.4, 23, 2.5],
            [x + (edge * width) / 2, d.sourceY + 2, 4],
            iron,
          );
        localBox(record, [width, 13, 2.8], [x, d.sourceY + 15, 4], oxide);
        for (const sx of [-width * 0.32, 0, width * 0.32])
          localBox(record, [0.75, 12, 1], [x + sx, d.sourceY + 15, 2.1], iron);
        localBox(record, [width + 2, 3, 7], [x, d.sourceY + 24, 3], iron);
      }
      localBox(record, [124, 4.5, 14], [95, d.sourceY + 38, 3], iron);
      localBox(record, [124, 1.8, 12], [95, d.sourceY + 31, 3], concrete);
      for (let x = 35; x <= 155; x += 6)
        localBox(record, [0.18, 2, 0.18], [x, d.sourceY + 32.8, -3], iron);
      localBox(record, [123, 0.16, 0.16], [95, d.sourceY + 33.8, -3], iron);
      const keeper = {
        position: world(f, 176, d.sourceY + 1, 2),
        quaternion: q,
      };
      localBox(keeper, [33, 24, 29], [0, 12, 0], brick);
      localBox(keeper, [39, 3, 35], [0, 25, 0], concrete);
      pitchedRoof(keeper, 40, 36, 8, 26.5);
      for (const x of [-11, -3.7, 3.7, 11])
        pane(keeper, 5.3, 11, [x, 15, -14.6], workRooms);
      const footing = d.sourceY - d.lowerY + 18;
      localBox(keeper, [41, footing, 37], [0, -footing / 2, 0], stone);
      workFixture(keeper, [0, 23, -17], {
        power: 1700,
        radius: 150,
        width: 12,
        priority: true,
      });
      // The elevated discharge is pressure-fed from the existing return pool,
      // not a magically lifted open water surface. Large intake risers and a
      // collector seat expose that process beside the ordinary driving view.
      for (const x of [57, 95]) {
        const points = [
          [x, 90, 27],
          [x, 99, 24],
          [x, 119, 16],
          [x, 126, 6],
        ].map(([x, y, z]) => world(f, x, y, z));
        pressureRun(points, 4);
        localBox(record, [13, 8, 19], [x, d.sourceY - 7, 12], concrete);
      }
      for (const x of [55, 94, 132]) {
        localBox(record, [11, 8, 15], [x, d.lowerY - 3, -23], stone);
        localBox(record, [16, 2, 19], [x, d.lowerY + 1, -23], concrete);
      }
      for (const x of [30, 164])
        localBox(record, [11, 17, 43], [x, d.lowerY - 1, -15], stone);
    }
    // A connected pressure-service quarter occupies the excavated outside
    // benches. Its long low roofs and deep dispatch openings contrast with
    // the tall municipal wards and the water courts across the road.
    for (
      let distance = track.length * 0.755, index = 0;
      distance < track.length * 0.945;
      distance += 93, index++
    ) {
      const f = layout.streetFrame(distance, -1),
        record = {
          position: f.position
            .clone()
            .addScaledVector(f.out, 108)
            .setY(f.position.y - 9),
          quaternion: f.quaternion,
        };
      if (!layout.clear(record.position, Math.hypot(94, 43) / 2)) continue;
      const h = [22, 30, 18, 25][index % 4];
      workFixture(record, [2, 12, -20], { power: 1800, radius: 120, width: 9 });
      localBox(record, [98, 13, 52], [0, -6.5, 0], stone);
      courtRange(record, -47, 47, -21.5, 21.5, h);
      for (const x of [-30, 2, 33]) {
        // Real vaulted dispatch bays are seated in the retained bench face.
        arch(22, 15, 6, record, [x, 0, -24], concrete);
        localBox(record, [18, 11, 1], [x, 5.5, -18.1], recess);
      }
      if (index % 3 === 0) {
        const tower = {
          ...record,
          position: local(record, [32, 0, 7]),
          width: 19,
          depth: 24,
          height: 48,
          ground: record.position.y - 12,
          row: 1,
          style: 0,
        };
        house(tower);
      }
      localBox(record, [99, 1.5, 11], [0, 0.4, -28], concrete);
      for (let x = -44; x <= 44; x += 11)
        localBox(record, [0.18, 1.3, 0.18], [x, 1.8, -33], iron);
      localBox(record, [97, 0.16, 0.16], [0, 2.4, -33], iron);
    }
    // A basin-control tower belongs to a real ward frontage rather than a
    // detached skyline spike; galleries and floor spacing retain human scale.
    const towerFrame = layout.streetFrame(track.length * 0.08, -1),
      towerPosition = towerFrame.position
        .clone()
        .addScaledVector(towerFrame.out, 146);
    if (
      layout.clear(towerPosition, 27) &&
      !layout.inRiver(towerPosition.x, towerPosition.z)
    ) {
      const record = {
        position: towerPosition.setY(
          Math.max(
            towerFrame.position.y - 12,
            layout.terrainHeight(towerPosition.x, towerPosition.z),
          ),
        ),
        quaternion: towerFrame.quaternion,
        width: 31,
        depth: 37,
        height: 128,
        ground: layout.terrainHeight(towerPosition.x, towerPosition.z),
        row: 1,
        style: 1,
      };
      house(record);
      localBox(record, [37, 7, 43], [0, 104, 0], stone);
      for (const x of [-14, 14])
        localBox(record, [3.5, 126, 4], [x, 63, -17], concrete);
    }
    for (const [material, parts] of buckets) {
      const flat = parts.map((geometry) =>
        geometry.index ? geometry.toNonIndexed() : geometry,
      );
      const merged = mergeGeometries(flat);
      for (const geometry of new Set([...parts, ...flat])) geometry.dispose();
      geometries.add(merged);
      const mesh = new T.Mesh(merged, material);
      mesh.name = `Lockdown / ${material.name}`;
      mesh.castShadow = !material.userData.window;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    buckets.clear();
    water = createLockdownWater(layout, view);
    machinery = createNightweirBlackstart(track, { turbines });
    group.add(water.group, machinery.group);
    // A fixed set of warmed lighting slots follows real authored work rooms.
    // Slot count never changes between presets or while rounding a bend.
    const workSlots = Array.from({ length: 4 }, () => {
      const light = new T.PointLight('#ffd4a3', 0, 120, 2);
      group.add(light);
      return light;
    });
    const updateWorkLights = (camera) => {
      if (!camera) return;
      const ordered = fixtures
        .map((fixture) => ({
          ...fixture,
          d: fixture.position.distanceToSquared(camera.position),
        }))
        .sort((a, b) => a.d - b.d);
      const primary = ordered.find(
        (fixture) => fixture.priority && fixture.d < 470 * 470,
      );
      const selected = [
        ...(primary ? [primary] : []),
        ...ordered.filter((fixture) => fixture !== primary),
      ].slice(0, 4);
      workSlots.forEach((light, index) => {
        const f = selected[index];
        light.intensity =
          f && f.d < (f.priority ? 470 : 230) ** 2 ? f.power : 0;
        if (f) {
          light.position.copy(f.position);
          light.distance = f.radius;
          light.color.set(f.color);
        }
      });
    };
    group.userData = {
      biome: 'nightweir',
      composition:
        'new closed hydroelectric basin / occupied wards, reservoir and generating terraces',
      buildings: layout.buildings.length,
      powerhouses: layout.halls.length,
      quayFrontages,
      originalCityLoaded: false,
    };
    return {
      group,
      layout,
      setReflection(texture) {
        for (const material of materials) {
          if (material === workLight) continue;
          material.envMap = texture;
          material.envMapIntensity =
            material === rock
              ? 0.35
              : material.userData.window
                ? 0.9
                : material === pressure
                  ? 1.05
                  : 0.8;
          material.needsUpdate = true;
        }
        water.setReflection(texture);
        machinery.setReflection(texture);
      },
      update(frame = {}) {
        water.update(frame);
        machinery.update(frame);
        updateWorkLights(frame.camera);
      },
      dispose,
    };
  } catch (error) {
    for (const parts of buckets.values())
      parts.forEach((geometry) => geometry.dispose());
    buckets.clear();
    dispose();
    throw error;
  }
}
