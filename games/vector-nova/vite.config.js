import { defineConfig } from 'vite';
import { relative, resolve } from 'node:path';
import { menuCatalog } from './tools/menu-catalog.mjs';

let devServer;
export default defineConfig({
  plugins: [
    {
      name: 'vector-nova-menu-catalog',
      configureServer(server) {
        devServer = server;
      },
      resolveId(id) {
        if (id === 'virtual:menu-catalog') return '\0virtual:menu-catalog';
      },
      async load(id) {
        if (id === '\0virtual:menu-catalog')
          return `export default ${JSON.stringify(await menuCatalog(devServer ? { loadModule: (path) => devServer.ssrLoadModule('/' + relative(resolve(import.meta.dirname), path)) } : {}))}`;
      },
      handleHotUpdate({ file, server }) {
        if (
          /\/src\/(levels|renderer|ships|track|physics|core)\/|\/public\/assets\//.test(
            file,
          )
        ) {
          const module = server.moduleGraph.getModuleById(
            '\0virtual:menu-catalog',
          );
          if (module) server.moduleGraph.invalidateModule(module);
          server.ws.send({ type: 'full-reload' });
        }
      },
    },
  ],
});
