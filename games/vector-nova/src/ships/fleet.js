import { Group } from 'three';
import { createShip } from './index.js';
import { getShip } from './catalog.js';

// Keep the root stable: level effects and the renderer borrow this same object
// for the whole session. Only one loaded chassis owns resources at a time.
export async function createFleetShip({ id = 'kestrel', ...options } = {}) {
  const group = new Group();
  let current = await createShip({ ...options, id });
  let selected = getShip(id);
  let generation = 0;
  let disposed = false;
  group.add(current.group);
  group.userData = current.group.userData;
  return {
    group,
    get selected() {
      return selected;
    },
    update(frame) {
      if (!disposed) current.update(frame);
    },
    async select(id) {
      const next = getShip(id);
      const request = ++generation;
      if (disposed) return false;
      if (next.id === selected.id) return true;
      const loaded = await createShip({ ...options, id: next.id });
      if (disposed || request !== generation) {
        loaded.dispose();
        return false;
      }
      current.dispose();
      current = loaded;
      selected = next;
      group.add(current.group);
      group.userData = current.group.userData;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      current.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
