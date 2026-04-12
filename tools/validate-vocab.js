#!/usr/bin/env node
// validate-vocab.js — validate vocab/roles/*.json against vocab/schemas/role.schema.json
//
// Usage:
//   node tools/validate-vocab.js              validate all roles
//   node tools/validate-vocab.js dev art qa   validate specific roles

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const SCHEMA     = JSON.parse(fs.readFileSync(path.join(ROOT, 'vocab/schemas/role.schema.json'), 'utf8'));
const ROLES_DIR  = path.join(ROOT, 'vocab/roles');

const SOURCE_PATTERN = /^(concept|game_plan|role:[a-z][a-z0-9_]*|external)$/;
const SLUG_PATTERN   = /^[a-z][a-z0-9_]*$/;
const CATEGORIES     = new Set(['creative', 'engineering', 'shipping']);

function err(file, msg) {
  return `  ✗  ${file}: ${msg}`;
}

function validateRole(file, data) {
  const errors = [];
  const f = path.basename(file, '.json');

  // required top-level fields
  for (const key of SCHEMA.required) {
    if (data[key] === undefined) errors.push(err(f, `missing required field "${key}"`));
  }

  if (errors.length) return errors; // stop early — downstream checks assume fields exist

  // id
  if (!SLUG_PATTERN.test(data.id)) errors.push(err(f, `id "${data.id}" must match ^[a-z][a-z0-9_]*$`));
  if (data.id !== f) errors.push(err(f, `id "${data.id}" must match filename "${f}"`));

  // category
  if (!CATEGORIES.has(data.category)) errors.push(err(f, `category must be one of: ${[...CATEGORIES].join(', ')}`));

  // inputs
  if (!Array.isArray(data.inputs) || data.inputs.length === 0) {
    errors.push(err(f, 'inputs must be a non-empty array'));
  } else {
    data.inputs.forEach((inp, i) => {
      if (!inp.source)   errors.push(err(f, `inputs[${i}]: missing "source"`));
      if (!inp.artifact) errors.push(err(f, `inputs[${i}]: missing "artifact"`));
      if (inp.required === undefined) errors.push(err(f, `inputs[${i}]: missing "required"`));
      if (inp.source && !SOURCE_PATTERN.test(inp.source)) {
        errors.push(err(f, `inputs[${i}]: source "${inp.source}" must match concept|game_plan|role:<id>|external`));
      }
    });
  }

  // outputs
  if (!Array.isArray(data.outputs) || data.outputs.length === 0) {
    errors.push(err(f, 'outputs must be a non-empty array'));
  } else {
    data.outputs.forEach((out, i) => {
      if (!out.artifact)    errors.push(err(f, `outputs[${i}]: missing "artifact"`));
      if (!out.description) errors.push(err(f, `outputs[${i}]: missing "description"`));
    });
  }

  // dependencies
  if (!Array.isArray(data.dependencies)) {
    errors.push(err(f, 'dependencies must be an array (use [] if none)'));
  } else {
    data.dependencies.forEach((dep, i) => {
      if (!SLUG_PATTERN.test(dep)) errors.push(err(f, `dependencies[${i}]: "${dep}" must match ^[a-z][a-z0-9_]*$`));
    });
  }

  // unknown top-level keys
  const allowed = new Set(Object.keys(SCHEMA.properties));
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) errors.push(err(f, `unknown field "${key}"`));
  }

  return errors;
}

function main() {
  const filter = process.argv.slice(2);

  let files;
  try {
    files = fs.readdirSync(ROLES_DIR)
      .filter(f => f.endsWith('.json'))
      .filter(f => filter.length === 0 || filter.includes(path.basename(f, '.json')));
  } catch {
    console.error(`Error: vocab/roles/ not found or empty`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(filter.length ? `No roles found matching: ${filter.join(', ')}` : 'No role files found in vocab/roles/');
    process.exit(0);
  }

  let totalErrors = 0;

  for (const file of files.sort()) {
    const fullPath = path.join(ROLES_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
      console.log(`  ✗  ${file}: invalid JSON — ${e.message}`);
      totalErrors++;
      continue;
    }

    const errors = validateRole(fullPath, data);
    if (errors.length) {
      errors.forEach(e => console.log(e));
      totalErrors += errors.length;
    } else {
      console.log(`  ✓  ${path.basename(file, '.json')}  (${data.name})`);
    }
  }

  console.log(`\n${files.length} role(s) checked, ${totalErrors} error(s)`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
