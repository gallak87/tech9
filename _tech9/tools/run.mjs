import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supportedNode } from './node-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function npmExecutable(node, env = process.env) {
  const directories = [
    path.dirname(node),
    ...(env.PATH ?? '').split(path.delimiter),
  ];
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = path.join(directory, 'npm');
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to another installed npm, using the selected Node on PATH.
    }
  }
  throw new Error(
    'npm was not found. Install npm with your supported Node runtime.',
  );
}

async function main(args) {
  if (!supportedNode(process.versions.node))
    throw new Error('Use the ./run launcher with supported Node.');
  if (args[0] === '--runtime') {
    console.log(
      JSON.stringify(
        {
          node: process.execPath,
          version: process.versions.node,
          npm: await npmExecutable(process.execPath),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!args.length || args[0] === '--help') {
    console.log(`Tech9 local launcher — forwards npm arguments from the framework directory.

./run --runtime                         Show the selected local runtime
./run ci                                Install framework dependencies
./run --prefix scenes/scene-test ci      Install the forest example
./run --prefix scenes/pond-test ci       Install the pond example
./run run dev:walk                      Open the walking forest example
./run run dev:pond                      Open the pond example
./run run t9 -- catalog                 List available capabilities
./run test                              Run framework checks

Set TECH9_NODE to choose an installed executable explicitly. No runtimes or
hooks are installed automatically. Child npm commands receive the same Node.
Games remain independently runnable with ordinary supported Node and npm.`);
    return;
  }
  const npm = await npmExecutable(process.execPath);
  const child = spawn(npm, args, {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    stdio: 'inherit',
  });
  const forward = (signal) => child.kill(signal);
  const interrupt = () => forward('SIGINT');
  const terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143);
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`tech9: ${error.message}`);
    process.exitCode = 1;
  });
}
