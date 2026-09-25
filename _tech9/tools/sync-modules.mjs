import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { confinedPath, loadCatalog, readJson } from './lib/project.mjs';

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

/** Maintainer-only snapshots into registered framework scenes, never existing games. */
export async function syncModules({ root, write = false }) {
  const catalog = await loadCatalog(root);
  const jobs = [];
  for (const scene of catalog.scenes) {
    if (!scene.path.startsWith('_tech9/scenes/'))
      throw new Error(
        `Module syncing is limited to framework scenes: ${scene.path}`,
      );
    const manifestPath = await confinedPath(
      root,
      `${scene.path}/capabilities.json`,
      { allowMissing: true },
    );
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (
      manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.modules) ||
      new Set(manifest.modules).size !== manifest.modules.length
    )
      throw new Error(`Invalid capabilities manifest: ${manifestPath}`);
    const copyRoot = await confinedPath(
      root,
      `${scene.path}/src/capabilities`,
      { allowMissing: true },
    );
    const copyEntries = await readdir(copyRoot).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of copyEntries) {
      if (entry !== 'PROVENANCE.json' && !manifest.modules.includes(entry))
        throw new Error(
          `Unexpected capability copy; inspect before removing: ${copyRoot}/${entry}`,
        );
    }
    const records = [];
    const copies = [];
    for (const id of manifest.modules) {
      const module = catalog.modules.find((item) => item.id === id);
      if (!module) throw new Error(`Unknown module ${id} in ${manifestPath}`);
      if (!module.path.startsWith('_tech9/modules/'))
        throw new Error(
          `Module syncing requires framework-owned source: ${module.path}`,
        );
      const moduleRoot = await confinedPath(root, module.path);
      const source = await confinedPath(root, `${module.path}/src`);
      const target = await confinedPath(
        root,
        `${scene.path}/src/capabilities/${id}`,
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
      const included = [
        ...sourceFiles.map((file) => `src/${file}`),
        ...documentation,
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
          `${scene.path}/src/capabilities/${id}/${file}`,
          { allowMissing: true },
        );
        entries.push({ path: file, sha256: sha256(content) });
        copies.push({ destination, content });
      }
      records.push({
        id,
        version: module.version,
        source: module.path,
        files: entries,
      });
    }
    const provenancePath = await confinedPath(
      root,
      `${scene.path}/src/capabilities/PROVENANCE.json`,
      { allowMissing: true },
    );
    jobs.push({
      scene: scene.id,
      provenancePath,
      provenance: {
        schemaVersion: 1,
        ownership: 'source-copy',
        modules: records,
      },
      copies,
    });
  }
  // Validate every path/source before making any writes.
  for (const job of jobs) {
    for (const { destination, content } of job.copies) {
      if (write) {
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
      } else {
        const current = await readFile(destination).catch((error) => {
          throw new Error(
            `Missing module copy ${destination}: ${error.message}`,
          );
        });
        if (!current.equals(content))
          throw new Error(
            `Module copy differs: ${destination}. Review source, then run sync:modules -- --write.`,
          );
      }
    }
    if (write) {
      await mkdir(path.dirname(job.provenancePath), { recursive: true });
      await writeFile(
        job.provenancePath,
        `${JSON.stringify(job.provenance, null, 2)}\n`,
      );
    } else if (
      !isDeepStrictEqual(await readJson(job.provenancePath), job.provenance)
    )
      throw new Error(`Module provenance differs: ${job.provenancePath}`);
  }
  return {
    mode: write ? 'write' : 'check',
    scenes: jobs.map((job) => ({ id: job.scene, files: job.copies.length })),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length && !['--write', '--check'].includes(args[0]))
  ) {
    console.error('Usage: node tools/sync-modules.mjs [--check | --write]');
    process.exitCode = 1;
  } else {
    syncModules({
      root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
      write: args[0] === '--write',
    })
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
