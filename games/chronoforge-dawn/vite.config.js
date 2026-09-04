export default {
  server: { host: '127.0.0.1' },
  // Relative base so the same build runs from a file path, from the Pages
  // project subpath (/tech9/) and from the site root without a rebuild.
  base: './',
  build: { target: 'esnext', sourcemap: false },
};
