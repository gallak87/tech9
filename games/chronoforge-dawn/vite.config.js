import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the forge installs a generated character. Root-level, not `public/`:
 *  Vite reloads the whole page when anything in publicDir changes, which would
 *  discard the scene, the camera and the sim before the swap event arrived. The
 *  dev server serves every file under the project root, so `/assets/kaida.glb`
 *  resolves either way.
 *
 *  `vite build` copies publicDir and nothing else, so the build half is
 *  forgeEmit() below: it writes the GRADUATED assets into dist/ by hand. */
const ASSETS = fileURLToPath(new URL('./assets', import.meta.url));

/**
 * Watch → HMR for generated characters.
 *
 * A runtime-fetched glb is not in the module graph, so Vite will not watch it
 * on its own, and the notification has to be a custom event because there is no
 * module to invalidate.
 *
 * chokidar 4 dropped glob support, so this watches the DIRECTORY — and a path
 * that does not exist yet is silently never watched, which is the state of this
 * repo until the forge has run once. Hence the mkdir at startup.
 *
 * Client half: src/actors/gltf-actor.js, under `if (import.meta.hot)`.
 */
function forgeWatch() {
  return {
    name: 'chronoforge:forge-watch',
    apply: 'serve',
    configureServer(server) {
      fs.mkdirSync(ASSETS, { recursive: true });
      server.watcher.add(ASSETS);

      const hot = server.hot ?? server.ws;
      const push = (file) => {
        const f = path.resolve(file);
        if (path.dirname(f) !== ASSETS) return;
        if (!/\.(glb|bones\.json)$/.test(f)) return;
        const name = path.basename(f).replace(/\.(glb|bones\.json)$/, '');
        hot.send({ type: 'custom', event: 'forge:character', data: { file: f, name, t: Date.now() } });
        server.config.logger.info(`forge → ${name} (${path.basename(f)})`, { timestamp: true });
      };

      server.watcher.on('change', push);
      server.watcher.on('add', push);
      server.config.logger.info(`forge watching ${path.relative(process.cwd(), ASSETS)}/ — kaida loads by default, ?forge=0 for the code-built rig`);
    },
  };
}

/** Graduated characters that MUST ship in a build.
 *
 *  Mirrors FORGED in src/actors/rig.js — a character listed there has no
 *  code-built stand-in, so a build without its glb renders nothing and logs a
 *  404. Add an entry here in the same commit that graduates a character.
 *
 *  Deliberately a list, not a copy of assets/: kaida-not.glb is a 19MB negative
 *  fixture for the rig gate and has no business on a game server. */
const SHIPPED = ['kaida.glb'];

/**
 * Copy the graduated assets into the build.
 *
 * assets/ lives at the project root rather than public/ (see above), so Vite
 * does not copy it. emitFile with type 'asset' puts each file where the runtime
 * looks for it — `new URL('assets/<id>.glb', document.baseURI)` — and keeps the
 * name unhashed, because that URL is constructed at runtime and never rewritten
 * by the bundler.
 *
 * Fails the build on a missing file. A silent 404 at runtime is the failure
 * this plugin exists to prevent; discovering it in CI beats discovering it on
 * the deployed site.
 */
function forgeEmit() {
  return {
    name: 'chronoforge:forge-emit',
    apply: 'build',
    generateBundle() {
      for (const file of SHIPPED) {
        const src = path.join(ASSETS, file);
        if (!fs.existsSync(src)) {
          this.error(`graduated asset missing: assets/${file} — it is in SHIPPED (vite.config.js) because the runtime has no fallback for it.`);
        }
        this.emitFile({ type: 'asset', fileName: `assets/${file}`, source: fs.readFileSync(src) });
      }
    },
  };
}

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
  plugins: [forgeWatch(), forgeEmit()],
};
