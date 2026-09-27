import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assembleSite,
  discoverGames,
  validateOutput,
} from '../tools/pages.mjs';

function fixture(t, entries) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tech9-pages-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, value] of Object.entries(entries)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(
      path.join(root, file),
      typeof value === 'object' ? JSON.stringify(value) : value,
    );
  }
  return { root, files: Object.keys(entries) };
}

const pkg = { scripts: { build: 'vite build' } };

test('discovers tracked browser packages and static games with stable pilot routes', (t) => {
  const { root, files } = fixture(t, {
    'games/static/src/index.html': 'static',
    'games/npm/package.json': pkg,
    'games/npm/index.html': 'npm',
    '_tech9/games/_pilot/flight/package.json': pkg,
    '_tech9/games/_pilot/flight/index.html': 'flight',
    '_tech9/games/_pilot/flight/examples/toy/index.html': 'not a game',
    'games/godot/game/project.godot': 'godot',
    'games/godot/index.html': 'an export is not a source browser game',
    'games/incomplete/package.json': { scripts: { dev: 'vite' } },
    'games/incomplete/index.html': 'incomplete',
    'games/untracked/index.html': 'local file',
    '_archive/games/old/src/index.html': 'old',
  });
  const tracked = files.filter((file) => !file.startsWith('games/untracked/'));
  const result = discoverGames(root, tracked);
  assert.deepEqual(result.games.map((game) => game.route).sort(), [
    '_pilot/flight',
    'npm',
    'static',
  ]);
  assert.equal(
    result.games.find((game) => game.route === 'static').source,
    'src',
  );
  assert.equal(result.skipped.length, 2);
  assert.equal(
    discoverGames(root, tracked, { includeArchive: true }).games.find(
      (game) => game.route === '_archive/old',
    ).mode,
    'static',
  );
  const promoted = tracked
    .filter((file) => file.startsWith('_tech9/'))
    .map((file) => file.slice('_tech9/'.length));
  const rootFixture = fixture(
    t,
    Object.fromEntries(
      promoted.map((file) => [
        file,
        file.endsWith('package.json') ? pkg : 'flight',
      ]),
    ),
  );
  assert.equal(
    discoverGames(rootFixture.root, rootFixture.files).games[0].route,
    '_pilot/flight',
  );
});

test('duplicate routes fail instead of replacing a game', (t) => {
  const { root, files } = fixture(t, {
    'games/same/src/index.html': 'old',
    '_tech9/games/same/src/index.html': 'new',
  });
  assert.throws(
    () => discoverGames(root, files),
    /Duplicate Pages route: same/,
  );
});

test('site includes nested pilot assets, Vulpine front door and a game directory', (t) => {
  const { root, files } = fixture(t, {
    'games/vulpine/package.json': pkg,
    'games/vulpine/index.html': 'source',
    'games/vulpine/dist/index.html': 'front door',
    'games/vulpine/dist/assets/logo.svg': '<svg/>',
    '_tech9/games/_pilot/flight/package.json': pkg,
    '_tech9/games/_pilot/flight/index.html': 'source',
    '_tech9/games/_pilot/flight/dist/index.html': 'flight',
    '_tech9/games/_pilot/flight/dist/assets/plane.glb': 'plane',
    'games/static/src/index.html': 'static',
    'games/static/src/main.js': 'main',
  });
  const games = discoverGames(root, files).games;
  const site = assembleSite(root, games);
  assert.equal(
    readFileSync(path.join(site, 'index.html'), 'utf8'),
    'front door',
  );
  assert.equal(
    readFileSync(path.join(site, 'vulpine/assets/logo.svg'), 'utf8'),
    '<svg/>',
  );
  assert.equal(
    readFileSync(path.join(site, '_pilot/flight/assets/plane.glb'), 'utf8'),
    'plane',
  );
  assert.equal(readFileSync(path.join(site, 'static/main.js'), 'utf8'), 'main');
  assert.match(
    readFileSync(path.join(site, 'games.html'), 'utf8'),
    /href="_pilot\/flight\/"/,
  );
  assembleSite(
    root,
    games.filter((game) => game.route !== 'vulpine'),
  );
  assert.match(
    readFileSync(path.join(site, 'index.html'), 'utf8'),
    /url=games.html/,
  );
});

test('missing built entry or graduated asset fails before publishing', (t) => {
  const { root, files } = fixture(t, {
    'games/chronoforge-dawn/package.json': pkg,
    'games/chronoforge-dawn/index.html': 'source',
  });
  const game = discoverGames(root, files).games[0];
  assert.throws(() => validateOutput(root, game), /missing dist\/index.html/);
  mkdirSync(path.join(root, game.directory, 'dist'));
  writeFileSync(path.join(root, game.directory, 'dist/index.html'), 'built');
  assert.throws(
    () => validateOutput(root, game),
    /missing graduated assets\/kaida.glb/,
  );
});
