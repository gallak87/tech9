export default {
  // docs/specs/*.mjs are RUNNABLE specs: the actors lane imports the same file
  // `node docs/specs/rig.mjs` executes, so there is exactly one copy of
  // SPRITE_PX_PER_METRE in the repo. Their CLI guard reads process.argv, which
  // does not exist in a browser; defining it as [] makes the guard evaluate to
  // false and the module import cleanly. No other process.* use exists in src/.
  define: { 'process.argv': '[]' },
  server: { host: '127.0.0.1' },
  // Relative base so the same build runs from a file path, from the Pages
  // project subpath (/tech9/) and from the site root without a rebuild.
  base: './',
  build: { target: 'esnext', sourcemap: false },
};
