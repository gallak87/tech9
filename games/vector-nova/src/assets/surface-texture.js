import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three';

/** Keep injected loaders and loading managers local to their resource owner. */
export function createSurfaceTextureLoader({ manager, loadTexture } = {}) {
  if (loadTexture) return loadTexture;
  const loader = new TextureLoader(manager);
  return (url) => loader.loadAsync(url);
}

/** Shared sampling setup only; the caller owns loading, publication and release. */
export function configureSurfaceTexture(
  texture,
  { colorSpace = SRGBColorSpace, anisotropy = 4, mipmaps = false } = {},
) {
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy;
  if (mipmaps) {
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = true;
  }
  texture.needsUpdate = true;
  return texture;
}
