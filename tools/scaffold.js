#!/usr/bin/env node
// scaffold.js — generate game files from a Director team_config.json
//
// Usage:
//   node tools/scaffold.js <path-to-team_config.json> [--force]
//
// --force overwrites existing files. Without it, existing files are skipped.

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

// ─── Args ────────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const configPath = args.find(a => !a.startsWith('--'));
const force      = args.includes('--force');

if (!configPath) {
  console.error('Usage: node tools/scaffold.js <team_config.json> [--force]');
  process.exit(1);
}

const ROOT    = path.resolve(__dirname, '..');
const gameDir = path.dirname(path.resolve(configPath));

// ─── Load inputs ─────────────────────────────────────────────────────────────

const config = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'));
validateConfig(config);

// Load all vocab roles indexed by id
const rolesDir = path.join(ROOT, 'vocab/roles');
const roles = {};
fs.readdirSync(rolesDir)
  .filter(f => f.endsWith('.json'))
  .forEach(f => {
    const role = JSON.parse(fs.readFileSync(path.join(rolesDir, f), 'utf8'));
    roles[role.id] = role;
  });

// Probe capabilities (non-fatal if probe fails)
let capabilities = { ollama: { available: false } };
try {
  const probeOut = execSync(`node "${path.join(ROOT, 'tools/probe.js')}" --json`, { timeout: 5000 });
  capabilities = JSON.parse(probeOut.toString());
} catch { /* offline — degrade gracefully */ }

// ─── Generate ─────────────────────────────────────────────────────────────────

const activeTeam = config.team.filter(t => t.active);
const generated  = [];
const skipped    = [];

write('GAME_PLAN.md',      renderGamePlan(config));
write('agents/.gitkeep',   '');  // ensure agents/ exists

for (const entry of activeTeam) {
  const role = roles[entry.role_id];
  if (!role) {
    console.warn(`  ⚠  Unknown role "${entry.role_id}" — skipping agent stub`);
    continue;
  }
  write(`agents/${role.id}.md`, renderAgentStub(role, entry, config));
}

// src/ skeleton — only if dev is active and src/ doesn't exist
if (activeTeam.some(t => t.role_id === 'dev')) {
  write('src/index.html', renderSrcSkeleton(config));
}

// Per-game run-art command — if art is active and image-gen available
if (activeTeam.some(t => t.role_id === 'art')) {
  const template = fs.readFileSync(
    path.join(ROOT, 'vocab/templates/commands/run-art.md'), 'utf8'
  );
  const spritesTable = renderSpritesTable(config);
  const visualStyle  = config.visual_style || '_See agents/art.md for visual style decisions._';
  const cmd = template
    .replace(/\{\{game_name\}\}/g,    config.game_name)
    .replace(/\{\{sprites_table\}\}/g, spritesTable)
    .replace(/\{\{visual_style\}\}/g,  visualStyle);
  write('.claude/commands/run-art.md', cmd);

  // sprites-manifest.json stub
  if (!exists('sprites-manifest.json') || force) {
    write('sprites-manifest.json', renderSpritesManifest(config, capabilities));
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

console.log(`\n${config.game_name} — scaffold complete\n`);
if (generated.length) console.log('  Generated:\n' + generated.map(f => `    + ${f}`).join('\n'));
if (skipped.length)   console.log('  Skipped (already exist):\n' + skipped.map(f => `    · ${f}`).join('\n'));
console.log(`\n  Capabilities: ollama ${capabilities.ollama.available ? '✓' : '✗ (run-art fallback mode)'}`);
console.log('\n  Next: run the Concept Generator and Director, then start Wave 1 agents.\n');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function write(relPath, content) {
  const full = path.join(gameDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (fs.existsSync(full) && !force) {
    skipped.push(relPath);
    return;
  }
  fs.writeFileSync(full, content, 'utf8');
  generated.push(relPath);
}

function exists(relPath) {
  return fs.existsSync(path.join(gameDir, relPath));
}

function fillTemplate(tmpl, vars) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v ?? ''),
    tmpl
  );
}

// ─── Validators ───────────────────────────────────────────────────────────────

function validateConfig(cfg) {
  const required = ['game_name', 'team', 'phases'];
  const missing  = required.filter(k => cfg[k] === undefined);
  if (missing.length) {
    console.error(`team_config.json missing required fields: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (!Array.isArray(cfg.team) || cfg.team.length === 0) {
    console.error('team_config.json: team must be a non-empty array');
    process.exit(1);
  }
  if (!Array.isArray(cfg.phases) || cfg.phases.length === 0) {
    console.error('team_config.json: phases must be a non-empty array');
    process.exit(1);
  }
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function renderGamePlan(cfg) {
  const activeRows = cfg.team
    .filter(t => t.active)
    .map(t => `| \`${t.role_id}\` | ${t.notes || ''} |`)
    .join('\n');

  const inactiveRows = cfg.team
    .filter(t => !t.active)
    .map(t => {
      const status = t.merged_into ? `merged into \`${t.merged_into}\`` : 'skipped';
      return `- \`${t.role_id}\` → ${status}${t.notes ? ' — ' + t.notes : ''}`;
    })
    .join('\n');

  const phases = cfg.phases.map(p => {
    const agentList = p.agents.map(a => `\`${a}\``).join(', ');
    const parallel  = p.parallel ? ' *(parallel)*' : '';
    const qaGate    = p.qa_gate ? `\nQA gate: ${p.qa_gate}` : '';
    return `### ${p.name}${parallel}\nAgents: ${agentList}\n\n${p.description}${qaGate}`;
  }).join('\n\n');

  const deferred = cfg.deferred_decisions?.length
    ? '\n## Key Decisions Deferred to Agents\n\n' +
      '| Decision | Deferred To |\n|----------|-------------|\n' +
      cfg.deferred_decisions.map(d => `| ${d.decision} | ${d.deferred_to} |`).join('\n')
    : '';

  return `# ${cfg.game_name.toUpperCase()} — Game Plan

## Team

| Agent | Notes |
|-------|-------|
${activeRows}

**Skipped / Merged:**
${inactiveRows || '_None_'}

---

## Phase Plan

${phases}
${deferred}
`;
}

function renderAgentStub(role, entry, cfg) {
  const inputsList = role.inputs
    .map(i => `- \`${i.artifact}\`${i.notes ? ' — ' + i.notes : ''}`)
    .join('\n');

  const outputsList = role.outputs
    .map(o => `- \`${o.artifact}\` — ${o.description}`)
    .join('\n');

  // First phase this agent appears in
  const firstPhase = cfg.phases.find(p => p.agents.includes(role.id));
  const phaseGoal  = firstPhase
    ? `**${firstPhase.name}:** ${firstPhase.description}`
    : '_See GAME_PLAN.md for phase schedule._';

  // Scope constraints as hard constraints
  const constraints = cfg.scope_constraints?.length
    ? cfg.scope_constraints.map(c => `- ${c}`).join('\n')
    : '_See CONCEPT.md scope constraints._';

  // Capability docs injection
  const capDocs = [];
  if (role.id === 'art' || role.id === 'asset') capDocs.push('capabilities/image-gen.md');
  const capSection = capDocs.length
    ? `\n## Capability Docs\n${capDocs.map(d => `- \`${d}\``).join('\n')}\n`
    : '';

  return fillTemplate(role.prompt_template, {
    game_name:        cfg.game_name,
    concept_summary:  cfg.concept_summary || '',
    phase_goal:       phaseGoal,
    inputs_list:      inputsList,
    outputs_list:     outputsList,
    hard_constraints: constraints,
  }) + capSection;
}

function renderSrcSkeleton(cfg) {
  const name = cfg.game_name;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
    canvas { display: block; image-rendering: pixelated; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script type="module" src="game.js"></script>
</body>
</html>
`;
}

function renderSpritesTable(cfg) {
  // Placeholder — art agent will fill in actual sprites
  return `| name | used for | size |\n|------|----------|------|\n| _tbd_ | _defined by art agent_ | _tbd_ |`;
}

function renderSpritesManifest(cfg, caps) {
  const model = caps.ollama?.models?.find(m => /flux/i.test(m)) || 'x/flux2-klein';
  return JSON.stringify({
    model,
    host: caps.ollama?.host || 'http://localhost:11434',
    sprites: [
      {
        _note: 'Add sprites here after art agent defines visual style and dimensions',
        name: 'example',
        w: 32,
        h: 32,
        prompt: 'pixel art game sprite, black background, retro, crisp limited palette',
        out: 'src/assets/example.png'
      }
    ]
  }, null, 2) + '\n';
}
