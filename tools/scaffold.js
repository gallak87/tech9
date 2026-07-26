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
const VALID_TIERS = ['canvas2d', 'pixi', 'phaser', 'threejs', 'godot'];
// Roles that build a native Godot game. Mutually exclusive with `dev` — see
// vocab/roles/06_dev.json. They get the godot-mcp capability doc and the godot stack.
const GODOT_ROLES = ['godot_dev', 'godot_techart', 'godot_tools'];

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

// Engine skeleton. Godot is a native project, not a web page — the two are exclusive.
if (config.rendering_tier === 'godot') {
  if (activeTeam.some(t => GODOT_ROLES.includes(t.role_id))) {
    write('project.godot', renderGodotProject(config));
    // The in-game half of the godot-mcp bridge. Without it every game_* tool fails,
    // and it is the single most common thing forgotten when starting a Godot project.
    const donor = path.join(ROOT, 'games/duneglide/mcp_interaction_server.gd');
    if (fs.existsSync(donor) && (!exists('mcp_interaction_server.gd') || force)) {
      write('mcp_interaction_server.gd', fs.readFileSync(donor, 'utf8'));
    } else if (!fs.existsSync(donor)) {
      console.warn('  ⚠  No mcp_interaction_server.gd donor found — copy one in by hand or godot-mcp will not work');
    }
  }
} else if (activeTeam.some(t => t.role_id === 'dev')) {
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
  const required = ['game_name', 'team', 'phases', 'rendering_tier'];
  const missing  = required.filter(k => cfg[k] === undefined);
  if (missing.length) {
    console.error(`team_config.json missing required fields: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (!VALID_TIERS.includes(cfg.rendering_tier)) {
    console.error(`team_config.json: rendering_tier must be one of: ${VALID_TIERS.join(', ')}`);
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
  // Build active role set for this game — used to skip inputs from omitted roles
  const activeRoleIds = new Set(cfg.team.filter(t => t.active).map(t => t.role_id));

  const relevantInputs = role.inputs.filter(inp => {
    const peerMatch = inp.source.match(/^role:(.+)$/);
    if (peerMatch) return activeRoleIds.has(peerMatch[1]); // drop if role not in this game
    return true; // concept / game_plan / external always included
  });

  const fmt = (i) => `- \`${i.artifact}\`${i.notes ? ' — ' + i.notes : ''}`;
  const inputsList = relevantInputs.map(fmt).join('\n') || '_None._';

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
  // Every Godot role needs the bridge — it is how they see what they build. QA too:
  // verifying a 3D build without it is not possible.
  if (GODOT_ROLES.includes(role.id) || (role.id === 'qa' && cfg.rendering_tier === 'godot')) {
    capDocs.push('capabilities/godot-mcp.md');
  }
  const capSection = capDocs.length
    ? `\n## Capability Docs\n${capDocs.map(d => `- \`${d}\``).join('\n')}\n`
    : '';

  // Dev-specific contract injections — reads stack template from vocab/templates/stacks/
  let devContracts = '';
  let renderingTierSection = '';
  if (role.id === 'dev' || GODOT_ROLES.includes(role.id)) {
    const tier = cfg.rendering_tier || 'pixi';
    const stackTemplateMap = {
      'canvas2d': 'stack-canvas2d.md',
      'pixi':     'stack-pixi.md',
      'threejs':  'stack-threejs.md',
      'godot':    'stack-godot.md',
    };
    const stackFile = stackTemplateMap[tier];
    if (stackFile) {
      const stackPath = path.join(ROOT, 'vocab/templates/stacks', stackFile);
      if (fs.existsSync(stackPath)) {
        renderingTierSection = fs.readFileSync(stackPath, 'utf8')
          .replace(/\{\{game_name\}\}/g, cfg.game_name);
      }
    }
    const pixiContracts = tier === 'pixi' ? `
## Sprite compositing contract
Flux generates sprites on solid black backgrounds. Non-tile sprites must use \`screen\` blend
to drop the black without masking:
\`\`\`js
// tile_ prefixed sprites → source-over (opaque ground tiles)
// everything else → screen blend
function drawSprite(container, name, x, y, w, h) {
  const sprite = new PIXI.Sprite(textures[name]);
  sprite.position.set(x, y);
  sprite.width = w; sprite.height = h;
  if (!name.startsWith('tile_')) sprite.blendMode = PIXI.BLEND_MODES.SCREEN;
  container.addChild(sprite);
}
\`\`\`
Always set \`PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST\` at boot for pixel art.
` : '';
    devContracts = `\n${pixiContracts}\n## Dev tools\nMount domain-scoped dev tools when the art agent requests one. Follow \`tools/dev-tool-contract.md\`.\nCheck \`window.__DEV_TOOLS__\` before mounting. Strip before ship.\n`;
  }


  return fillTemplate(role.prompt_template, {
    game_name:              cfg.game_name,
    concept_summary:        cfg.concept_summary || '',
    phase_goal:             phaseGoal,
    inputs_list:            inputsList,
    outputs_list:           outputsList,
    hard_constraints:       constraints,
    rendering_tier_section: renderingTierSection,
  }) + capSection + devContracts;
}

// Minimal but correct project.godot. The autoload and the renderer line are the two
// things that are painful to discover missing, so they ship in the skeleton.
function renderGodotProject(cfg) {
  const name = cfg.game_name;
  return `; Engine configuration for ${name}
; Generated by tools/scaffold.js — see vocab/templates/stacks/stack-godot.md

config_version=5

[application]

config/name="${name}"
run/main_scene="res://scenes/Main.tscn"
config/features=PackedStringArray("4.4", "Forward Plus")

[autoload]

; REQUIRED for the godot-mcp bridge. Remove this and no game_* tool works.
McpInteractionServer="*res://mcp_interaction_server.gd"

[rendering]

; Forward+ is required for glow. Mobile/Compatibility silently drop it.
renderer/rendering_method="forward_plus"
; MSAA 2x + FXAA. Do NOT enable TAA if any shader displaces vertices — Godot builds
; motion vectors from PREV_MODEL_MATRIX and smears displaced geometry to mush.
anti_aliasing/quality/msaa_3d=1
anti_aliasing/quality/screen_space_aa=1
`;
}

function renderSrcSkeleton(cfg) {
  const name = cfg.game_name;
  const tier = cfg.rendering_tier || 'pixi';

  const pixiBootstrap = `
  <script type="module">
    import * as PIXI from 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs';
    window.__PIXI__ = PIXI;
  </script>
  <script type="module" src="game.js"></script>`;

  const canvas2dBootstrap = `
  <script type="module" src="game.js"></script>`;

  const threejsBootstrap = `
  <script type="module" src="main.js"></script>`;

  const bootstrap = tier === 'canvas2d' ? canvas2dBootstrap
                  : tier === 'threejs'  ? threejsBootstrap
                  : pixiBootstrap;
  const canvasEl  = tier === 'canvas2d' ? '\n  <canvas id="canvas"></canvas>' : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
    canvas { display: block; image-rendering: pixelated; }
  </style>
</head>
<body>${canvasEl}
  <!-- DEV TOOLS — remove before ship or set window.__DEV_TOOLS__ = false -->
  <script>window.__DEV_TOOLS__ = true;</script>${bootstrap}
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
    note: 'Minimum sprite sizes: battle sprites ≥ 96px, portraits ≥ 144px, tiles = 64px, icons ≥ 40px. Below these sizes flux detail is lost on downscale.',
    sprites: [
      {
        _note: 'Add sprites here after art agent defines visual style and dimensions',
        name: 'example',
        w: 64,
        h: 64,
        prompt: 'pixel art game sprite, pure black background (#000000), detailed shading with rim light, crisp readable silhouette centered in frame, no text, no watermark, no border frame, retro, crisp limited palette',
        out: 'src/assets/example.png'
      }
    ]
  }, null, 2) + '\n';
}
