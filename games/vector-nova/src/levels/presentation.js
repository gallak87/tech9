import { createLifetime } from '../core/lifecycle.js';

// Each component owns its group/resources; renderer assets and probes are borrowed.
export async function createLevelPresentation(definition, context) {
  const lifetime = createLifetime();
  const parts = [];
  async function acquire(factory, label, componentContext = context) {
    const part = await factory(componentContext);
    if (!part || typeof part.dispose !== 'function')
      throw new Error(`Invalid ${label}: dispose is required`);
    lifetime.own(part);
    if (!part.group?.isObject3D)
      throw new Error(`Invalid ${label}: group is required`);
    context.view.scene.add(part.group);
    lifetime.defer(() => part.group.removeFromParent());
    await part.ready;
    parts.push(part);
    return part;
  }
  try {
    const road = await acquire(definition.createRoad, 'road');
    const environment = await acquire(
      definition.createEnvironment,
      'environment',
      { ...context, road },
    );
    const overlay = definition.createOverlay
      ? lifetime.own(await definition.createOverlay(context))
      : null;
    let reset = true;
    let disposed = false;
    return {
      road: road.group,
      environment: environment.group,
      reset() {
        if (disposed) return;
        reset = true;
        for (const part of parts) part.reset?.();
        overlay?.reset?.();
      },
      setReflection(texture) {
        if (disposed) return;
        for (const part of parts) part.setReflection?.(texture);
      },
      update(frame) {
        if (disposed) return;
        const update = {
          ...frame,
          reset,
          dt: frame.mode === 'racing' ? frame.dt : 0,
        };
        for (const part of parts) part.update?.(update);
        context.view.updatePresentation(update);
        overlay?.update?.(update);
        reset = false;
      },
      afterRender(frame) {
        if (!disposed) overlay?.afterRender?.(frame);
      },
      getPresentation: () => overlay?.getPresentation?.() ?? {},
      dispose() {
        if (disposed) return;
        disposed = true;
        lifetime.dispose();
      },
    };
  } catch (error) {
    try {
      lifetime.dispose();
    } catch (cleanupError) {
      error.cause = cleanupError;
    }
    throw error;
  }
}
