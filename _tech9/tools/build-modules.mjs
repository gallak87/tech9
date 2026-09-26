import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { confinedPath, readJson } from './lib/project.mjs';
import { validateCatalog } from './lib/validation.mjs';

const framework = fileURLToPath(new URL('..', import.meta.url));

async function entries(directory, prefix = '') {
  const result = {};
  for (const item of await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  })) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink())
      throw new Error(`Module build rejects symlinks: ${relative}`);
    if (item.isDirectory())
      Object.assign(result, await entries(directory, relative));
    else if (item.isFile() && /\.m?js$/.test(item.name))
      result[relative.replace(/\.m?js$/, '')] = path.join(directory, relative);
  }
  return result;
}

/** Compile canonical source only. Games and scene packages are never inputs. */
export async function buildModules({ root = framework, write = true } = {}) {
  const catalog = validateCatalog(
    await readJson(path.join(root, 'catalog.json')),
  );
  const entry = {},
    sources = [];
  for (const module of catalog.modules) {
    if (!module.path.startsWith('_tech9/modules/'))
      throw new Error(
        `Module build requires framework-owned source: ${module.path}`,
      );
    const source = await confinedPath(
      root,
      `${module.path.slice('_tech9/'.length)}/src`,
    );
    const files = await entries(source);
    if (!Object.keys(files).length)
      throw new Error(`Module ${module.id} has no JavaScript entries`);
    sources.push(source);
    for (const [name, file] of Object.entries(files))
      entry[`${module.id}/${name}`] = file;
  }
  if (!sources.length) throw new Error('No modules are registered for build');
  return build({
    root,
    configFile: false,
    logLevel: 'warn',
    build: {
      write,
      outDir: path.join(root, '.artifacts/module-build'),
      emptyOutDir: true,
      minify: false,
      lib: {
        entry,
        formats: ['es'],
        fileName: (_format, name) => `${name}.js`,
      },
      rolldownOptions: {
        external: (id) => id === 'three' || id.startsWith('three/'),
      },
    },
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  buildModules()
    .then(() =>
      console.log(
        'Canonical modules built in .artifacts/module-build (Three.js external).',
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
