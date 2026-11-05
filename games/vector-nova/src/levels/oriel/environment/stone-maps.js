import * as T from 'three';
import { SharedKTX2Loader } from '../../../assets/ktx2-loader.js';
import { assetURL } from '../../../assets/url.js';

/** Borrow the registered Concrete034 substrate; this owner acquires independent
 * decoded textures and releases them without affecting Helion or other worlds. */
export async function createOrielStoneMaps(renderer, lifetime) {
  const loader = new SharedKTX2Loader().detectSupport(renderer);
  lifetime.defer(() => loader.dispose());
  const results = await Promise.allSettled(
    ['color', 'normal', 'arm'].map(async (name) => {
      const texture = await loader.loadAsync(
        assetURL(`assets/levels/helion/ceramic/${name}.ktx2`),
      );
      lifetime.own(texture);
      texture.colorSpace = name === 'color' ? T.SRGBColorSpace : T.NoColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(1 / 1.1, 1 / 0.55);
      texture.anisotropy = Math.min(
        8,
        renderer.capabilities.getMaxAnisotropy(),
      );
      texture.name = `Oriel / CC0 mineral substrate ${name}`;
      return texture;
    }),
  );
  const failure = results.find((r) => r.status === 'rejected');
  if (failure)
    throw new Error('Oriel stone finish could not load. Reload to try again.', {
      cause: failure.reason,
    });
  const [color, normal, arm] = results.map((r) => r.value);
  return {
    apply(material) {
      material.map = color;
      material.normalMap = normal;
      material.roughnessMap = arm;
      material.normalScale.set(0.32, 0.32);
      material.roughness = 0.9;
      material.needsUpdate = true;
    },
    coordinates(geometry, track) {
      const p = geometry.attributes.position,
        n = geometry.attributes.normal,
        road = geometry.attributes.roadCoord;
      const uv = new Float32Array(p.count * 2);
      const frames = new Map();
      for (let i = 0; i < p.count; i++) {
        if (road && !geometry.userData.orielEndCap) {
          const s = road.getX(i);
          let transverse = road.getY(i);
          if (track) {
            if (!frames.has(s)) frames.set(s, track.sample(s));
            const f = frames.get(s),
              normal = new T.Vector3(n.getX(i), n.getY(i), n.getZ(i));
            if (Math.abs(normal.dot(f.up)) < 0.7)
              transverse = new T.Vector3(p.getX(i), p.getY(i), p.getZ(i))
                .sub(f.position)
                .dot(f.up);
          }
          uv[i * 2] = transverse;
          uv[i * 2 + 1] = s;
          continue;
        }
        const x = Math.abs(n.getX(i)),
          y = Math.abs(n.getY(i)),
          z = Math.abs(n.getZ(i));
        uv[i * 2] = x > y && x > z ? p.getZ(i) : p.getX(i);
        uv[i * 2 + 1] = y > x && y > z ? p.getZ(i) : p.getY(i);
      }
      geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
    },
  };
}
