// Adapt approved level builders without teaching core their private userData API.
export function legacyPart(group, update) {
  let disposed = false;
  return {
    group,
    ready: group.userData.ready,
    update: (frame) => {
      if (!disposed) update?.(frame);
    },
    setReflection: (texture) => group.userData.setReflection?.(texture),
    dispose() {
      if (disposed) return;
      disposed = true;
      group.userData.dispose?.();
    },
  };
}
