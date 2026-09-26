import {
  DataTexture,
  FloatType,
  RGBAFormat,
  LinearFilter,
  Vector3,
} from 'three';
import { clamp } from './state.js';

/** A hit describes the receiving surface AND overhead cover. No global raycaster. */
export function surfaceHit(query, x, z) {
  const hit = query?.(x, z);
  if (
    !hit ||
    !hit.position ||
    !hit.normal ||
    ![...hit.position, ...hit.normal].every(Number.isFinite)
  )
    return null;
  const length = Math.hypot(...hit.normal);
  if (length < 0.0001) return null;
  return {
    position: [...hit.position],
    normal: hit.normal.map((v) => v / length),
    exposure: clamp(Number.isFinite(hit.exposure) ? hit.exposure : 1),
    snowRetention: clamp(
      Number.isFinite(hit.snowRetention) ? hit.snowRetention : 1,
    ),
    puddle: clamp(Number.isFinite(hit.puddle) ? hit.puddle : 0),
    coverHeight: Number.isFinite(hit.coverHeight)
      ? Math.max(hit.position[1], hit.coverHeight)
      : hit.position[1],
  };
}
export function createSurfaceField(query, bounds, resolution = 128) {
  if (
    !bounds ||
    !['minX', 'maxX', 'minZ', 'maxZ'].every((key) =>
      Number.isFinite(bounds[key]),
    ) ||
    bounds.maxX <= bounds.minX ||
    bounds.maxZ <= bounds.minZ
  )
    throw new Error('Weather requires finite, non-empty surfaceBounds.');
  const size = Math.round(clamp(resolution, 8, 256));
  const data = new Float32Array(size * size * 4);
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const wx = bounds.minX + ((x + 0.5) / size) * (bounds.maxX - bounds.minX);
      const wz = bounds.minZ + ((z + 0.5) / size) * (bounds.maxZ - bounds.minZ);
      const hit = surfaceHit(query, wx, wz);
      data.set(
        hit
          ? [hit.position[1], hit.exposure, hit.snowRetention, hit.coverHeight]
          : [-10000, 0, 0, -10000],
        (z * size + x) * 4,
      );
    }
  const texture = new DataTexture(data, size, size, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    bounds: new Vector3(bounds.minX, bounds.minZ, 0),
    size: [bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ],
    dispose: () => texture.dispose(),
  };
}
export const surfaceGLSL = `
uniform sampler2D weatherField;
uniform vec4 weatherBounds;
vec4 weatherSurface(vec2 p) {
  vec2 uv = (p - weatherBounds.xy) / weatherBounds.zw;
  if(any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(-10000.0, 0.0, 0.0, -10000.0);
  return texture2D(weatherField, uv);
}
float weatherHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float weatherNoise(vec2 p) {
 vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(weatherHash(i),weatherHash(i+vec2(1,0)),f.x),mix(weatherHash(i+vec2(0,1)),weatherHash(i+vec2(1,1)),f.x),f.y);
}`;
