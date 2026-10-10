import * as THREE from 'three';
import { createStudioEnvironment } from './studio-environment.js';

/** Neutral studio reflections are borrowed only while drawing inspection. */
export function createInspectionStage(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#131b23');
  const environment = createStudioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight('#e4eaf0', '#222830', 0.16));
  const key = new THREE.DirectionalLight('#fff5e6', 1.5);
  key.position.set(-3.8, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, {
    left: -5,
    right: 5,
    top: 5,
    bottom: -5,
    near: 0.1,
    far: 30,
  });
  key.shadow.normalBias = 0.015;
  key.shadow.bias = -0.0001;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#e0edff', 0.8);
  rim.position.set(6, 4, -5);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 0.4, 96),
    new THREE.MeshStandardMaterial({
      color: '#20272d',
      roughness: 0.48,
      metalness: 0.12,
      envMap: environment.texture,
      envMapIntensity: 0.15,
    }),
  );
  floor.position.y = -0.7;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.4, 0.014, 6, 128),
    new THREE.MeshBasicMaterial({ color: '#38434c' }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.48;
  scene.add(ring);
  return {
    scene,
    render(draw) {
      const borrowed = new Map();
      scene.traverse((object) => {
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          // This stage owns the floor reflection. Keeping its explicit map
          // preserves its lower intensity instead of the scene-wide setting.
          if (
            material === floor.material ||
            !material?.isMeshStandardMaterial ||
            borrowed.has(material)
          )
            continue;
          borrowed.set(material, material.envMap);
          material.envMap = null;
        }
      });
      renderer.shadowMap.needsUpdate = true;
      try {
        draw(scene);
      } finally {
        for (const [material, reflection] of borrowed)
          material.envMap = reflection;
      }
    },
    dispose() {
      key.shadow.map?.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      ring.geometry.dispose();
      ring.material.dispose();
      environment.dispose();
      scene.clear();
    },
  };
}
