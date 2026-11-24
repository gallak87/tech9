import { TextureSource } from 'three';

const defaultCanvas = (width, height) => {
  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

// Texture clones often share a source with the fleet cache or another level.
// Replace only this texture's source, and retain its original for live High/Low
// switches. Never resize borrowed pixels in place or dispose borrowed textures.
export function createTextureBudget({ createCanvas = defaultCanvas } = {}) {
  const retained = new Map();
  let disposed = false;
  function visitTexture(texture, maxSize, anisotropy) {
    if (
      !texture?.isTexture ||
      texture.isRenderTargetTexture ||
      texture.isDataTexture ||
      texture.isData3DTexture ||
      texture.isDataArrayTexture ||
      texture.isCubeTexture
    )
      return;
    let record = retained.get(texture);
    if (!record) {
      record = {
        source: texture.source,
        mipmaps: texture.mipmaps,
        anisotropy: texture.anisotropy,
        lowSource: null,
        lowSize: null,
        lowMipmaps: null,
        firstLowMip: 0,
        swapping: false,
        onDispose: null,
      };
      retained.set(texture, record);
      record.onDispose = () => {
        if (record.swapping) return;
        retained.delete(texture);
        texture.removeEventListener('dispose', record.onDispose);
      };
      texture.addEventListener('dispose', record.onDispose);
    }
    const image = record.source.data;
    let source = record.source,
      mipmaps = record.mipmaps;
    if (image?.width > maxSize || image?.height > maxSize) {
      if (texture.isCompressedTexture) {
        const first = record.mipmaps.findIndex(
          (mip) => Math.max(mip.width, mip.height) <= maxSize,
        );
        if (first > 0) {
          if (record.firstLowMip !== first) {
            record.firstLowMip = first;
            record.lowMipmaps = record.mipmaps.slice(first);
            record.lowSource = new TextureSource({
              width: record.lowMipmaps[0].width,
              height: record.lowMipmaps[0].height,
            });
          }
          source = record.lowSource;
          mipmaps = record.lowMipmaps;
        }
      } else {
        if (record.lowSize !== maxSize) {
          const scale = maxSize / Math.max(image.width, image.height);
          const canvas = createCanvas(
            Math.max(1, Math.round(image.width * scale)),
            Math.max(1, Math.round(image.height * scale)),
          );
          const context = canvas.getContext('2d');
          if (!context) return;
          if (texture.userData.editorPanorama)
            context.imageSmoothingQuality = 'high';
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          record.lowSource = new TextureSource(canvas);
          record.lowSize = maxSize;
        }
        source = record.lowSource;
      }
    }
    const nextAnisotropy = Math.min(record.anisotropy, anisotropy);
    if (
      texture.source !== source ||
      texture.anisotropy !== nextAnisotropy ||
      texture.mipmaps !== mipmaps
    ) {
      // Three's source cache retains the old allocation unless it is released
      // before changing the source identity. Keep our original-source record.
      record.swapping = true;
      try {
        texture.dispose();
      } finally {
        record.swapping = false;
      }
      texture.source = source;
      texture.mipmaps = mipmaps;
      texture.anisotropy = nextAnisotropy;
      texture.needsUpdate = true;
    }
  }
  return {
    apply(
      scene,
      {
        textureSize = Infinity,
        editorPanoramaSize = textureSize,
        anisotropy = Infinity,
      } = {},
    ) {
      if (disposed) return;
      const seen = new Set();
      const objects = new WeakSet();
      const applyTexture = (texture) => {
        if (seen.has(texture)) return;
        seen.add(texture);
        const maxSize = texture.userData.editorPanorama
          ? editorPanoramaSize
          : textureSize;
        visitTexture(texture, maxSize, anisotropy);
      };
      const visit = (value) => {
        if (value?.isTexture) {
          applyTexture(value);
        } else if (value && typeof value === 'object' && !objects.has(value)) {
          objects.add(value);
          if (Array.isArray(value)) value.forEach(visit);
          else if (value.constructor === Object)
            Object.values(value).forEach(visit);
        }
      };
      scene.traverse((object) => {
        for (const material of [object.material].flat().filter(Boolean)) {
          for (const texture of Object.values(material)) {
            if (texture?.isTexture) applyTexture(texture);
          }
          for (const uniform of Object.values(material.uniforms ?? {}))
            visit(uniform.value);
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [texture, record] of retained) {
        texture.removeEventListener('dispose', record.onDispose);
        if (
          texture.source !== record.source ||
          texture.mipmaps !== record.mipmaps ||
          texture.anisotropy !== record.anisotropy
        ) {
          texture.dispose();
          texture.needsUpdate = true;
        }
        texture.source = record.source;
        texture.mipmaps = record.mipmaps;
        texture.anisotropy = record.anisotropy;
      }
      retained.clear();
    },
  };
}
