import { Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';

// Borrow only hull geometry. No actor, input, collision, device, lights or
// particle emitters exist on this presentation-only personal ghost.
export function createPersonalGhost(scene) {
  const root = new Group();
  root.name = 'Personal best ghost / non-colliding';
  root.visible = false;
  scene.add(root);
  const material = new MeshBasicMaterial({
    color: 0x73e5ed,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const endPosition = new Vector3(),
    endRotation = new Quaternion();
  let samples = null;
  return {
    reset(source, trajectory) {
      root.clear();
      root.visible = false;
      samples = trajectory;
      if (!samples) return;
      source.updateWorldMatrix(true, true);
      const inverse = source.matrixWorld.clone().invert();
      source.traverse((object) => {
        if (!object.isMesh || object.userData.exhaustHeat) return;
        for (
          let parent = object;
          parent && parent !== source;
          parent = parent.parent
        )
          if (!parent.visible) return;
        const mesh = new Mesh(object.geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.multiplyMatrices(inverse, object.matrixWorld);
        root.add(mesh);
      });
    },
    update(time, visible, playerPosition) {
      root.visible = Boolean(samples && visible && time <= samples.at(-1)[0]);
      if (!root.visible) return;
      let low = 0,
        high = samples.length - 1;
      while (high - low > 1) {
        const mid = (low + high) >> 1;
        if (samples[mid][0] <= time) low = mid;
        else high = mid;
      }
      const a = samples[low],
        b = samples[high];
      const blend = Math.max(0, Math.min(1, (time - a[0]) / (b[0] - a[0])));
      root.position.fromArray(a, 1).lerp(endPosition.fromArray(b, 1), blend);
      root.quaternion.fromArray(a, 4).slerp(endRotation.fromArray(b, 4), blend);
      // Fade at overlap so the ghost never masks the driver's own hull.
      material.opacity =
        0.28 *
        Math.min(
          1,
          Math.max(0, root.position.distanceTo(playerPosition) - 3) / 12,
        );
    },
    dispose() {
      root.removeFromParent();
      root.clear();
      material.dispose();
      samples = null;
    },
  };
}
