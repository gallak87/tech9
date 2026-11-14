/** Compose level-owned effects around a motion adapter without owning its clock
 * or dynamics step. Local hooks run after the same resolved step in both paths. */
export function wrapStagedRuntime(runtime, hooks) {
  let pending = null;
  const owner = {
    ...runtime,
    advance(state, input, dt, modifiers) {
      const before = hooks.capture(state);
      const events = runtime.advance(state, input, dt, modifiers);
      return hooks.finish(state, events, before);
    },
    reset(options = {}) {
      pending = null;
      runtime.reset(options);
      hooks.reset?.(options);
    },
    snapshot() {
      const data = runtime.snapshot();
      return hooks.snapshot ? hooks.snapshot(data) : data;
    },
    restore(data) {
      hooks.validateRestore?.(data);
      runtime.restore(data);
      pending = null;
      hooks.restore?.(data);
    },
    dispose() {
      pending = null;
      hooks.dispose?.();
      runtime.dispose();
    },
  };
  if (runtime.beginAdvance) {
    owner.beginAdvance = (state, input, dt, modifiers) => {
      if (pending)
        throw new Error(`Finish the pending ${hooks.name} step first`);
      pending = hooks.capture(state);
      runtime.beginAdvance(state, input, dt, modifiers);
    };
    owner.finishAdvance = (state) => {
      if (!pending)
        throw new Error(`Stage the ${hooks.name} step before resolving it`);
      const before = pending;
      const events = runtime.finishAdvance(state);
      pending = null;
      return hooks.finish(state, events, before);
    };
  }
  if (hooks.readFrame)
    owner.readFrame = () => hooks.readFrame(runtime.readFrame());
  return owner;
}
