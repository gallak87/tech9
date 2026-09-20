export const point = (x, y) => ({ x, y });
export const road = (...pts) => pts.map((p) => point(...p));
export const obj = (id, type, x, y, extra = {}) => ({
  id,
  type,
  x,
  y,
  ...extra,
});
export const encounter = (id, x, y, enemies, extra = {}) =>
  obj(id, 'encounter', x, y, { enemies, ...extra });
export const consoleAt = (id, name, x, y, extra = {}) =>
  obj(id, 'console', x, y, { name, ...extra });
export const pickup = (id, item, x, y, amount = 1) =>
  obj(id, 'pickup', x, y, { item, amount, name: 'Recovered supplies' });
export const landmark = (id, name, x, y, style = 'ring', extra = {}) =>
  obj(id, 'landmark', x, y, { name, style, ...extra });
export const sign = (id, name, x, y, dialogue) =>
  obj(id, 'sign', x, y, { name, dialogue });
export const camp = (id, x, y) =>
  obj(id, 'camp', x, y, { name: 'Wayfarer’s rest', service: 'rest' });
