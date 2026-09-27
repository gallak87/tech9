import path from 'node:path';
import { startingPoint } from './starting-points.mjs';

export const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;

export function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

export function safeRelative(value, label = 'path') {
  assert(text(value), `${label} must be a nonempty relative path`);
  assert(
    !value.includes('\\') && !path.posix.isAbsolute(value),
    `${label} must use relative POSIX paths`,
  );
  assert(
    !/^[a-z]:/i.test(value) && !value.includes('\0'),
    `${label} is unsafe`,
  );
  assert(
    !value
      .split('/')
      .some((part) => part === '..' || part === '.' || part === ''),
    `${label} must not contain traversal or empty segments`,
  );
  return value;
}

function slug(value, label) {
  assert(
    typeof value === 'string' && SLUG.test(value) && value.length <= 64,
    `${label} must be a lowercase slug (maximum 64 characters)`,
  );
}

function version(value, label) {
  assert(
    typeof value === 'string' && VERSION.test(value),
    `${label} must be a semantic version`,
  );
}

function strings(value, label, min = 0) {
  assert(
    Array.isArray(value) && value.length >= min && value.every(text),
    `${label} must be an array of nonempty strings${min ? ' with at least one entry' : ''}`,
  );
}

function uniqueIds(entries, label) {
  assert(Array.isArray(entries), `${label} must be an array`);
  const seen = new Set();
  for (const entry of entries) {
    assert(object(entry), `${label} entries must be objects`);
    slug(entry.id, `${label}.id`);
    assert(!seen.has(entry.id), `Duplicate ${label} id: ${entry.id}`);
    seen.add(entry.id);
  }
  return seen;
}

export function validateModules(registry) {
  assert(
    object(registry) && registry.schemaVersion === 1,
    'Modules schemaVersion must be 1',
  );
  const ids = uniqueIds(registry.modules, 'modules');
  for (const module of registry.modules) {
    version(module.version, `Module ${module.id} version`);
    if (module.requires === undefined) continue;
    const requirements = module.requires;
    assert(
      object(requirements),
      `Module ${module.id} requires must be an object`,
    );
    for (const key of Object.keys(requirements))
      assert(
        ['runtime', 'renderer', 'modules', 'dependencies'].includes(key),
        `Unknown requirement ${key} in module ${module.id}`,
      );
    if (requirements.runtime !== undefined)
      assert(
        requirements.runtime === 'web',
        `Module ${module.id} requires an unsupported runtime`,
      );
    if (requirements.renderer !== undefined)
      assert(
        ['canvas2d', 'pixi', 'three'].includes(requirements.renderer),
        `Module ${module.id} requires an unsupported renderer`,
      );
    if (requirements.modules !== undefined) {
      strings(requirements.modules, `Module ${module.id} requirements.modules`);
      assert(
        new Set(requirements.modules).size === requirements.modules.length,
        `Module ${module.id} has duplicate module requirements`,
      );
      for (const id of requirements.modules)
        assert(
          ids.has(id) && id !== module.id,
          `Module ${module.id} requires unknown or self module ${id}`,
        );
    }
    if (requirements.dependencies !== undefined) {
      assert(
        object(requirements.dependencies),
        `Module ${module.id} dependencies must be an object`,
      );
      for (const [name, requiredVersion] of Object.entries(
        requirements.dependencies,
      )) {
        assert(
          /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name),
          `Module ${module.id} has invalid package dependency ${name}`,
        );
        version(requiredVersion, `Module ${module.id} dependency ${name}`);
      }
    }
  }
  return registry;
}

function ownershipPath(value) {
  safeRelative(value, 'Lane ownership path');
  const plain = value.endsWith('/**') ? value.slice(0, -3) : value;
  assert(
    !/[*?[\]{}]/.test(plain),
    'Ownership paths support concrete paths or a trailing /** only',
  );
  return plain.replace(/\/$/, '');
}

export function validatePlan(plan, baselineVersion) {
  assert(
    object(plan) && plan.schemaVersion === 2,
    'Plan schemaVersion must be 2',
  );
  if (plan.startingPoint !== undefined) startingPoint(plan.startingPoint);
  slug(plan.id, 'Plan id');
  assert(text(plan.title) && text(plan.pitch), 'Plan needs a title and pitch');
  version(plan.baselineVersion, 'Plan baselineVersion');
  assert(
    ['approved', 'draft'].includes(plan.status),
    'Plan status must be approved or draft',
  );
  assert(
    object(plan.authorization) &&
      ['delegated', 'explicit'].includes(plan.authorization.mode) &&
      text(plan.authorization.basis),
    'Plan needs an authorization mode and basis',
  );
  assert(object(plan.scope), 'Plan needs scope');
  strings(plan.scope.mustHave, 'scope.mustHave', 1);
  strings(plan.scope.outOfScope, 'scope.outOfScope');
  const milestones = uniqueIds(plan.milestones, 'milestones');
  assert(milestones.size > 0, 'Plan needs at least one milestone');
  for (const milestone of plan.milestones) {
    assert(text(milestone.title), `Milestone ${milestone.id} needs a title`);
    strings(
      milestone.deliverables,
      `Milestone ${milestone.id} deliverables`,
      1,
    );
    strings(milestone.acceptance, `Milestone ${milestone.id} acceptance`, 1);
  }
  const laneIds = uniqueIds(plan.lanes, 'lanes');
  assert(laneIds.size > 0, 'Plan needs at least one lane');
  const owners = [];
  for (const lane of plan.lanes) {
    assert(text(lane.role), `Lane ${lane.id} needs a role`);
    strings(lane.owns, `Lane ${lane.id} owns`);
    strings(lane.dependsOn, `Lane ${lane.id} dependsOn`);
    assert(
      new Set(lane.dependsOn).size === lane.dependsOn.length,
      `Lane ${lane.id} has duplicate dependencies`,
    );
    for (const dependency of lane.dependsOn)
      assert(
        laneIds.has(dependency),
        `Lane ${lane.id} has unknown dependency ${dependency}`,
      );
    for (const value of lane.owns) {
      const owned = ownershipPath(value);
      for (const previous of owners) {
        const overlaps =
          owned === previous.path ||
          owned.startsWith(`${previous.path}/`) ||
          previous.path.startsWith(`${owned}/`);
        assert(
          !overlaps,
          `Ownership overlap: ${lane.id}:${value} and ${previous.lane}:${previous.path}`,
        );
      }
      owners.push({ path: owned, lane: lane.id });
    }
  }
  const byId = new Map(plan.lanes.map((lane) => [lane.id, lane]));
  const visited = new Set();
  const pending = new Set();
  function visit(id) {
    assert(!pending.has(id), `Lane dependency cycle involving ${id}`);
    if (visited.has(id)) return;
    pending.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    pending.delete(id);
    visited.add(id);
  }
  for (const id of laneIds) visit(id);
  assert(object(plan.validation), 'Plan needs validation');
  strings(plan.validation.commands, 'validation.commands', 1);
  strings(plan.validation.playthrough, 'validation.playthrough', 1);
  const performance = plan.validation.performance;
  assert(
    object(performance) &&
      Number.isFinite(performance.targetFps) &&
      performance.targetFps > 0,
    'validation.performance.targetFps must be positive',
  );
  assert(
    object(performance.viewport) &&
      Number.isInteger(performance.viewport.width) &&
      performance.viewport.width > 0 &&
      Number.isInteger(performance.viewport.height) &&
      performance.viewport.height > 0,
    'validation.performance.viewport needs positive integer dimensions',
  );
  assert(
    text(performance.quality),
    'validation.performance.quality is required',
  );
  assert(
    object(plan.artGate) &&
      Number.isFinite(plan.artGate.threshold) &&
      plan.artGate.threshold > 0 &&
      plan.artGate.threshold <= 10 &&
      Number.isSafeInteger(plan.artGate.maxRounds) &&
      plan.artGate.maxRounds > 0,
    'artGate needs a threshold in (0, 10] and a positive safe-integer maxRounds',
  );
  assert(text(plan.stopAfter), 'Plan needs stopAfter');
  if (baselineVersion !== undefined) {
    assert(
      plan.baselineVersion === baselineVersion,
      `Baseline version mismatch: plan ${plan.baselineVersion}, package ${baselineVersion}`,
    );
  }
  return plan;
}
