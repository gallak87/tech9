export default {
  // `open` carries ?dev=1 so `npm run dev` lands on the page with the dev panel
  // already up. The harness hits the URL directly and never gets the flag, so
  // review captures stay clean.
  server: { host: '127.0.0.1', open: '/?dev=1' },
  // Relative base so the same build runs from a file path, from the Pages
  // project subpath (/tech9/) and from the site root without a rebuild.
  base: './',
  build: { target: 'esnext', sourcemap: false },
};
