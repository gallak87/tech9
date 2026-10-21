import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confinedPath, loadModules, readJson } from './lib/project.mjs';

import { startingPoint, packageModules } from './lib/starting-points.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function files(root, relative = '') {
  const entries = await readdir(path.join(root, relative), {
    withFileTypes: true,
  });
  const result = [];
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink())
      throw new Error(`Module copies cannot contain symlinks: ${name}`);
    if (entry.isDirectory()) result.push(...(await files(root, name)));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Module copies require regular files: ${name}`);
  }
  return result;
}

/** Refresh the baseline's selected module source copies. */
export async function syncModules({ root, write = false, from, packagePath }) {
  if (from !== undefined && packagePath !== undefined)
    throw new Error('Choose --from or --package, not both');
  const destinationPackage = packagePath ?? startingPoint(from).path;
  if (
    destinationPackage === 'modules' ||
    destinationPackage.startsWith('modules/')
  )
    throw new Error('Module copies cannot target canonical modules');
  const registry = await loadModules(root);
  const packageJson = await readJson(
    await confinedPath(root, `${destinationPackage}/package.json`),
  );
  const selected = packageModules(
    packageJson,
    registry,
    `${destinationPackage}/package.json`,
  );
  if (packagePath === undefined) {
    const source = startingPoint(from);
    if (
      packageJson.tech9.runtime !== source.runtime ||
      packageJson.tech9.renderer !== source.renderer
    )
      throw new Error(
        `Starting package ${source.name} must declare runtime ${source.runtime} and renderer ${source.renderer}`,
      );
  }
  const copyRoot = await confinedPath(
    root,
    `${destinationPackage}/src/modules`,
    {
      allowMissing: true,
    },
  );
  const copyEntries = await readdir(copyRoot).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of copyEntries) {
    if (entry !== 'PROVENANCE.json' && !selected.includes(entry))
      throw new Error(
        `Unexpected module copy; inspect before removing: ${copyRoot}/${entry}`,
      );
  }
  const records = [];
  const copies = [];
  for (const id of selected) {
    const module = registry.modules.find((item) => item.id === id);
    const modulePath = `modules/${id}`;
    const moduleRoot = await confinedPath(root, modulePath);
    const source = await confinedPath(root, `${modulePath}/src`);
    const target = await confinedPath(
      root,
      `${destinationPackage}/src/modules/${id}`,
      { allowMissing: true },
    );
    const sourceFiles = await files(source);
    if (!sourceFiles.length)
      throw new Error(`Module ${id} contains no source files`);
    const documentation = (await readdir(moduleRoot)).filter(
      (name) =>
        name === 'README.md' ||
        /(?:LICENSE|NOTICE).*(?:\.txt|\.md)?$/i.test(name),
    );
    const assetsRoot = await confinedPath(moduleRoot, 'assets', {
      allowMissing: true,
    });
    const assets = await files(assetsRoot).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const included = [
      ...sourceFiles.map((file) => `src/${file}`),
      ...documentation,
      ...assets.map((file) => `assets/${file}`),
    ].sort();
    const existing = await files(target).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const file of existing)
      if (!included.includes(file))
        throw new Error(
          `Unexpected module-copy file; inspect before removing: ${target}/${file}`,
        );
    const entries = [];
    for (const file of included) {
      const content = await readFile(await confinedPath(moduleRoot, file));
      const destination = await confinedPath(
        root,
        `${destinationPackage}/src/modules/${id}/${file}`,
        { allowMissing: true },
      );
      entries.push({ path: file, sha256: sha256(content) });
      copies.push({ destination, content });
    }
    records.push({
      id,
      version: module.version,
      source: modulePath,
      files: entries,
    });
  }
  const provenancePath = await confinedPath(
    root,
    `${destinationPackage}/src/modules/PROVENANCE.json`,
    { allowMissing: true },
  );
  const provenance = { schemaVersion: 1, modules: records };
  // A minimal scaffold with no copies need not carry an empty provenance file.
  if (!selected.length && !copyEntries.length && !write)
    return {
      mode: 'check',
      package: destinationPackage,
      modules: [],
      files: 0,
    };
  // Validate every source and destination before writing.
  for (const { destination, content } of copies) {
    if (write) {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    } else {
      const current = await readFile(destination).catch((error) => {
        throw new Error(`Missing module copy ${destination}: ${error.message}`);
      });
      if (!current.equals(content))
        throw new Error(
          `Module copy differs: ${destination}. Review source, then run sync:modules -- --write.`,
        );
    }
  }
  if (write) {
    await mkdir(path.dirname(provenancePath), { recursive: true });
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  } else if (!isDeepStrictEqual(await readJson(provenancePath), provenance))
    throw new Error(`Module provenance differs: ${provenancePath}`);
  return {
    mode: write ? 'write' : 'check',
    package: destinationPackage,
    modules: selected,
    files: copies.length,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const options = {
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  };
  try {
    const seen = new Set();
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const key = ['--write', '--check'].includes(arg) ? 'mode' : arg;
      if (seen.has(key)) throw new Error(`Duplicate sync option ${arg}`);
      seen.add(key);
      if (arg === '--write' || arg === '--check')
        options.write = arg === '--write';
      else if (arg === '--from' || arg === '--package') {
        const value = args[++i];
        if (!value || value.startsWith('--'))
          throw new Error(`${arg} needs a value`);
        options[arg === '--from' ? 'from' : 'packagePath'] = value;
      } else throw new Error(`Unknown sync option: ${arg}`);
    }
    if (options.from && options.packagePath)
      throw new Error('Choose --from or --package, not both');
    console.log(JSON.stringify(await syncModules(options), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
