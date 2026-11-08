// These transformations only run at the verification browser's response boundary.
// Never add probe methods or a test-only import to the shipped runtime.
const snapshotMethod = '      getSnapshot() {';

export function replaceOnce(source, anchor, replacement, label = anchor) {
  const count = anchor ? source.split(anchor).length - 1 : 0;
  if (count !== 1) throw new Error(`Expected one ${label}; found ${count}.`);
  return source.replace(anchor, () => replacement);
}

export const insertRuntimeMethods = (source, methods) =>
  replaceOnce(
    source,
    snapshotMethod,
    `${methods}\n${snapshotMethod}`,
    'runtime snapshot insertion point',
  );

export function routeRuntimeProbe(
  context,
  methods,
  { transform = (source) => source } = {},
) {
  return context.route('**/src/core/game.js*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body: insertRuntimeMethods(transform(source), methods),
    });
  });
}
