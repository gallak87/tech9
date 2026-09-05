import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the forge installs a generated character. Root-level, not `public/`:
 *  Vite reloads the whole page when anything in publicDir changes, which would
 *  discard the scene, the camera and the sim before the swap event arrived. The
 *  dev server serves every file under the project root, so `/assets/kaida.glb`
 *  resolves either way.
 *
 *  Cost: `vite build` copies publicDir and nothing else, so a generated
 *  character is dev-only until this directory moves under public/. */
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
      server.config.logger.info(`forge watching ${path.relative(process.cwd(), ASSETS)}/ — load with ?forge=kaida`);
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
  plugins: [forgeWatch()],
};
