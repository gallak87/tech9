export const pickupQuality = (settings) =>
  settings?.quality === 'low' ? 'low' : 'high';

// Only the selected renderer owns resources. Keep the attachment when swapping;
// callers may mount feedback under a ship, inspector root or world scene.
export function createQualityPresentation(
  settings,
  create,
  settingsFromUpdate,
) {
  let quality = pickupQuality(settings);
  let current = create(quality);
  let disposed = false;
  return {
    get group() {
      return current.group;
    },
    get hitActive() {
      return current.hitActive;
    },
    update(...args) {
      if (disposed) return;
      const nextSettings = settingsFromUpdate(...args);
      const next = nextSettings?.quality
        ? pickupQuality(nextSettings)
        : quality;
      if (next !== quality) {
        const parent = current.group?.parent;
        current.dispose();
        quality = next;
        current = create(quality);
        if (parent && current.group.parent !== parent)
          parent.add(current.group);
      }
      current.update(...args);
    },
    reset() {
      if (!disposed) current.reset?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      current.dispose();
    },
  };
}
