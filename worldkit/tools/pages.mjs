import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only package roots directly inside games/ or games/_pilot/ are deployable.
// Asset examples, preparation folders and Godot projects are not browser games.
export function discoverGames(root, files, { includeArchive = false } = {}) {
  const tracked = new Set(files);
  const roots = ['games', 'worldkit/games'];
  if (includeArchive) roots.push('_archive/games');
  const candidates = new Set();
  for (const file of files) {
    for (const base of roots) {
      if (!file.startsWith(`${base}/`)) continue;
      const rest = file.slice(base.length + 1).split('/');
      const slug = rest[0] === '_pilot' ? rest.slice(0, 2).join('/') : rest[0];
      if (slug && (!slug.startsWith('_') || slug.startsWith('_pilot/')))
        candidates.add(`${base}/${slug}`);
    }
  }
  const games = [];
  const skipped = [];
  for (const directory of [...candidates].sort()) {
    const packageFile = `${directory}/package.json`;
    const pkg = tracked.has(packageFile)
      ? JSON.parse(readFileSync(path.join(root, packageFile), 'utf8'))
      : null;
    const entry = ['index.html', 'src/index.html'].find((file) =>
      tracked.has(`${directory}/${file}`),
    );
    const godot =
      tracked.has(`${directory}/project.godot`) ||
      tracked.has(`${directory}/game/project.godot`);
    if (godot || !entry || (pkg && !pkg.scripts?.build)) {
      skipped.push({
        directory,
        reason: godot ? 'Godot project' : 'no browser entry/build',
      });
      continue;
    }
    const base = roots.find((value) => directory.startsWith(`${value}/`));
    const route = `${base === '_archive/games' ? '_archive/' : ''}${directory.slice(base.length + 1)}`;
    if (games.some((game) => game.route === route))
      throw new Error(`Duplicate Pages route: ${route}`);
    games.push({
      directory,
      route,
      mode: pkg ? 'build' : 'static',
      source: pkg ? 'dist' : path.posix.dirname(entry),
      scripts: pkg?.scripts ?? {},
    });
  }
  return { games, skipped };
}

function runNpm(root, game, args) {
  console.log(`\n${game.directory}: npm ${args.join(' ')}`);
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: path.join(root, game.directory),
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', HUSKY: '0' },
  });
}

export function validateOutput(root, game) {
  const output = path.join(root, game.directory, game.source);
  const entry = path.join(output, 'index.html');
  if (!existsSync(entry))
    throw new Error(`${game.directory}: missing ${game.source}/index.html`);
  if (
    path.posix.basename(game.directory) === 'chronoforge-dawn' &&
    !existsSync(path.join(output, 'assets/kaida.glb'))
  ) {
    throw new Error(`${game.directory}: missing graduated assets/kaida.glb`);
  }
  return output;
}

export function buildGame(root, game) {
  if (game.mode === 'build') {
    const locked = existsSync(
      path.join(root, game.directory, 'package-lock.json'),
    );
    runNpm(root, game, locked ? ['ci'] : ['install', '--no-package-lock']);
    // Preserve the existing release gate for this game.
    if (path.posix.basename(game.directory) === 'chronoforge-echo') {
      runNpm(root, game, ['run', 'lint']);
      runNpm(root, game, ['test']);
    }
    // Single Vite builds accept a relative asset base for all Pages routes.
    const args = ['run', 'build'];
    if (/^vite build(?:\s+[^;&|]*)?$/.test(game.scripts.build))
      args.push('--', '--base', './');
    runNpm(root, game, args);
    if (game.scripts['verify:build'])
      runNpm(root, game, ['run', 'verify:build']);
  }
  return validateOutput(root, game);
}

export function assembleSite(root, games) {
  const site = path.join(root, '_site');
  const outputs = games.map((game) => ({
    game,
    output: validateOutput(root, game),
  }));
  rmSync(site, { recursive: true, force: true });
  mkdirSync(site, { recursive: true });
  // Retain the existing front door when Vulpine is present. Every game also
  // gets its own stable route, including Vulpine itself.
  const front = outputs.find(({ game }) => game.route === 'vulpine');
  if (front) cpSync(front.output, site, { recursive: true });
  else
    writeFileSync(
      path.join(site, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=games.html"><title>Tech9 games</title><a href="games.html">Browse games</a>\n',
    );
  for (const { game, output } of outputs)
    cpSync(output, path.join(site, game.route), { recursive: true });
  const escape = (value) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character],
    );
  const links = games
    .map(
      (game) =>
        `<li><a href="${game.route.split('/').map(encodeURIComponent).join('/')}/">${escape(game.route)}</a></li>`,
    )
    .join('\n');
  writeFileSync(
    path.join(site, 'games.html'),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tech9 games</title><h1>Tech9 games</h1><ul>${links}</ul>\n`,
  );
  writeFileSync(path.join(site, '.nojekyll'), '');
  return site;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const { games, skipped } = discoverGames(root, files, {
    includeArchive: process.env.INCLUDE_ARCHIVE_GAMES === 'true',
  });
  for (const entry of skipped)
    console.log(`Skip ${entry.directory}: ${entry.reason}`);
  for (const game of games)
    console.log(`${game.directory} → /${game.route}/ (${game.mode})`);
  if (!process.argv.includes('--list')) {
    for (const game of games) buildGame(root, game);
    console.log(`Pages output: ${assembleSite(root, games)}`);
  }
}
