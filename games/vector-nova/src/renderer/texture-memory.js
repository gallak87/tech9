import * as T from 'three';
const compressedFormats = new Map([
  [T.RGBA_ASTC_4x4_Format, 'ASTC 4x4'],
  [T.RGBA_BPTC_Format, 'BC7 / BPTC'],
  [T.RGB_ETC1_Format, 'ETC1'],
  [T.RGB_ETC2_Format, 'ETC2 RGB'],
  [T.RGBA_ETC2_EAC_Format, 'ETC2 RGBA'],
  [T.RGBA_S3TC_DXT1_Format, 'BC1'],
  [T.RGBA_S3TC_DXT5_Format, 'BC3'],
]);

// Actual transcoded mip payloads account for compressed blocks and tiny mips.
// This describes uploaded texture data, excluding driver/alignment overhead.
export function textureMemory(texture) {
  const mipBytes =
    texture.mipmaps?.reduce(
      (sum, mip) => sum + (mip.data?.byteLength || 0),
      0,
    ) || 0;
  const image = texture.image;
  const baseBytes =
    image?.data?.byteLength ||
    (image?.width || 256) * (image?.height || 256) * 4;
  return {
    bytes: mipBytes || baseBytes * (texture.generateMipmaps ? 4 / 3 : 1),
    compressed: Boolean(
      texture.isCompressedTexture && texture.format !== T.RGBAFormat,
    ),
    format:
      compressedFormats.get(texture.format) ||
      (texture.isCompressedTexture && texture.format !== T.RGBAFormat
        ? `compressed:${texture.format}`
        : 'uncompressed'),
  };
}
