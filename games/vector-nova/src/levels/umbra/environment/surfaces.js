import * as T from 'three';
import { assetURL } from '../../../assets/url.js';

export const UMBRA_SURFACE_URL = assetURL(
  'assets/levels/umbra/umbra-surfaces-v1.png',
);

// Each component owns its loader result, including rollback before boot.
export async function loadUmbraSurface() {
  const texture = await new T.TextureLoader().loadAsync(UMBRA_SURFACE_URL);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
