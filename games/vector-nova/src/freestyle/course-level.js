import createSkywell from '../levels/launchworks/index.js';

/** The established Freestyle owner supplies contact, scoring, sound and catch
 * feedback. Sibling courses replace only their authored world and road finish.
 */
export function createFreestyleCourse({
  id,
  createTrack,
  createEnvironment,
  createBackdrop,
  renderer,
  palette,
}) {
  const base = createSkywell();
  return {
    ...base,
    version: `1.0.0-${id}`,
    renderer: { ...base.renderer, ...renderer },
    createTrack,
    createEnvironment,
    createBackdrop,
    createRoad(context) {
      const road = base.createRoad(context);
      road.group.name = `${id} / manufactured transfer deck and receiving throats`;
      if (!context.shape)
        road.group.traverse((mesh) => {
          for (const material of [mesh.material].flat().filter(Boolean)) {
            if (/graphite metric twill/.test(material.name)) {
              material.name = `${id} / satin mineral-composite running slab`;
              material.color.set(palette.deck);
              material.map = material.normalMap = material.roughnessMap = null;
              material.metalness = palette.metalness ?? 0.18;
              material.roughness = 0.6;
            } else if (/ivory limestone/.test(material.name)) {
              material.color.set(palette.stone);
            } else if (/bronze load carriers/.test(material.name)) {
              material.color.set(palette.metal);
            }
          }
        });
      return road;
    },
  };
}
