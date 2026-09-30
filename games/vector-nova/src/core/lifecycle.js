// Register owners, never traverse borrowed material maps to guess ownership.
export function createLifetime() {
  const releases = [];
  let disposed = false;
  return {
    defer(release) {
      if (disposed) throw new Error('Cannot acquire resources after disposal');
      releases.push(release);
    },
    own(resource) {
      if (typeof resource?.dispose !== 'function')
        throw new Error('Owned resources require a dispose method');
      this.defer(() => resource.dispose());
      return resource;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const release of releases.reverse()) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      releases.length = 0;
      if (errors.length)
        throw new AggregateError(errors, 'Resource cleanup failed');
    },
  };
}
