#!/usr/bin/env node
'use strict';

/**
 * Clone + build the Godot MCP server and write a project-scoped .mcp.json.
 *
 * The Godot games in this repo (currently duneglide and void-fracture) are
 * driven through an MCP server that talks to a TCP bridge running inside the
 * game. Without it an agent can create files but cannot launch the game, read
 * the scene tree, inject input, or take screenshots — i.e. it cannot see what
 * it built. Web games need none of this.
 *
 *   node tools/setup-godot-mcp.js           clone, build, write .mcp.json
 *   node tools/setup-godot-mcp.js --check   report status, change nothing
 *
 * Env overrides:
 *   GODOT_MCP_DIR  where to clone the server (default: ../godot-mcp)
 *   GODOT_PATH     the Godot 4.4+ binary
 */

const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO_URL = 'https://github.com/tugcantopaloglu/godot-mcp.git';
const ROOT = path.resolve(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

const MCP_DIR = path.resolve(
  process.env.GODOT_MCP_DIR || path.join(ROOT, '..', 'godot-mcp')
);
const ENTRY = path.join(MCP_DIR, 'build', 'index.js');
const CONFIG = path.join(ROOT, '.mcp.json');

const GODOT_CANDIDATES = [
  process.env.GODOT_PATH,
  '/Applications/Godot.app/Contents/MacOS/Godot',
  '/usr/local/bin/godot',
  '/opt/homebrew/bin/godot',
];

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`  \x1b[36m·\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const fail = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

function findGodot() {
  for (const c of GODOT_CANDIDATES) {
    if (c && fs.existsSync(c)) return c;
  }
  try {
    const which = execSync('command -v godot4 || command -v godot', {
      encoding: 'utf8',
    }).trim();
    if (which && fs.existsSync(which)) return which;
  } catch {
    /* not on PATH */
  }
  return null;
}

function godotVersion(bin) {
  try {
    return execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function main() {
  console.log('\nGodot MCP setup\n');

  // ── Godot binary ──────────────────────────────────────────
  const godot = findGodot();
  if (!godot) {
    fail('No Godot binary found.');
    console.log(
      `\n    Install Godot 4.4+ from https://godotengine.org/download` +
        `\n    or point GODOT_PATH at it:` +
        `\n      GODOT_PATH=/path/to/Godot npm run mcp:setup\n`
    );
    process.exit(1);
  }
  const ver = godotVersion(godot);
  ok(`Godot: ${godot}${ver ? `  (${ver})` : ''}`);

  // ── server checkout ───────────────────────────────────────
  if (!fs.existsSync(MCP_DIR)) {
    if (CHECK_ONLY) {
      fail(`Server not cloned (expected at ${MCP_DIR})`);
      process.exit(1);
    }
    info(`Cloning ${REPO_URL}`);
    info(`     -> ${MCP_DIR}`);
    fs.mkdirSync(path.dirname(MCP_DIR), { recursive: true });
    run('git', ['clone', '--depth', '1', REPO_URL, MCP_DIR]);
  } else {
    ok(`Server checkout: ${MCP_DIR}`);
  }

  // ── build ─────────────────────────────────────────────────
  if (CHECK_ONLY) {
    if (fs.existsSync(ENTRY)) ok(`Built: ${ENTRY}`);
    else fail(`Not built — run: npm run mcp:setup`);
  } else {
    info('Installing dependencies…');
    run('npm', ['install'], MCP_DIR);
    // `npm install` triggers the package's own `prepare` -> `build`, but run it
    // explicitly so a checkout that already had node_modules still rebuilds.
    info('Building…');
    run('npm', ['run', 'build'], MCP_DIR);
    if (!fs.existsSync(ENTRY)) {
      fail(`Build finished but ${ENTRY} is missing.`);
      process.exit(1);
    }
    ok(`Built: ${ENTRY}`);
  }

  // ── .mcp.json ─────────────────────────────────────────────
  // Absolute paths, generated per machine, so .mcp.json is gitignored.
  const config = {
    mcpServers: {
      'godot-mcp': {
        type: 'stdio',
        command: 'node',
        args: [ENTRY],
        env: {
          GODOT_PATH: godot,
          // Sandbox the server to this repo — it can write files and launch
          // processes, so don't hand it the whole filesystem.
          GODOT_MCP_ALLOWED_DIRS: ROOT,
        },
      },
    },
  };

  if (CHECK_ONLY) {
    if (fs.existsSync(CONFIG)) ok(`Config: ${CONFIG}`);
    else fail(`No .mcp.json — run: npm run mcp:setup`);
    console.log('');
    return;
  }

  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
  ok(`Wrote ${path.relative(ROOT, CONFIG)}`);

  console.log(
    `\nRestart Claude Code so it picks up .mcp.json, then check with \`/mcp\`.` +
      `\nVerify end to end:` +
      `\n  ask it to run games/duneglide and take a screenshot.\n`
  );
}

main();
