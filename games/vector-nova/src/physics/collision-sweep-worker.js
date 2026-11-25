import { createSweepIndex } from './collision-sweep-index.js';

self.addEventListener(
  'message',
  ({ data }) => {
    const index = createSweepIndex(data);
    self.postMessage(index, [
      index.faceBounds.buffer,
      index.nodeBounds.buffer,
      index.links.buffer,
      index.order.buffer,
    ]);
  },
  { once: true },
);
