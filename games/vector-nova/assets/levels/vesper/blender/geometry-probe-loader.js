import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Node-only geometry/clearance probe adapter for the textured runtime GLB.
 * It preserves real mesh attributes, transforms, joints and material bindings,
 * substituting a Texture object for bitmap decoding. It does not validate pixels
 * or shaders; the production browser loads the embedded image normally.
 */
export function createVesperGeometryProbeLoader() {
  return new GLTFLoader().register(() => ({
    name: 'VESPER_geometry_probe',
    loadTexture: () => Promise.resolve(new Texture()),
  }));
}
