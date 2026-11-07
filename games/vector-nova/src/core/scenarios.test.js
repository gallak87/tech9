import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenarioDescriptors } from './scenarios.js';

test('scenario descriptors preserve key order, property order and plain hyphen labels', () => {
  const scenarios = {
    'second-jump': { distance: 200 },
    10: { speed: 10 },
    2: { speed: 2 },
    'Mixed_case--setup': { distance: 300 },
  };
  const descriptors = createScenarioDescriptors(scenarios);
  assert.deepEqual(Object.keys(descriptors), [
    '2',
    '10',
    'second-jump',
    'Mixed_case--setup',
  ]);
  assert.deepEqual(Object.keys(descriptors['second-jump']), ['label', 'state']);
  assert.equal(descriptors['second-jump'].label, 'second jump');
  assert.equal(descriptors['Mixed_case--setup'].label, 'Mixed_case  setup');
  assert.equal(Object.getPrototypeOf(descriptors), Object.prototype);
});

test('scenario state copies are independent at the top level and keep nested aliases', () => {
  const nested = { lane: 3 };
  const source = Object.freeze({ distance: 50, nested });
  const scenarios = Object.freeze({ approach: source });
  const first = createScenarioDescriptors(scenarios);
  const second = createScenarioDescriptors(scenarios);
  assert.notEqual(first.approach, second.approach);
  assert.notEqual(first.approach.state, source);
  assert.notEqual(first.approach.state, second.approach.state);
  assert.equal(first.approach.state.nested, nested);
  first.approach.state.distance = 75;
  assert.equal(source.distance, 50);
  assert.equal(second.approach.state.distance, 50);
  nested.lane = 4;
  assert.equal(first.approach.state.nested.lane, 4);
});

test('descriptor enumeration retains own enumerable entries and spread-state semantics', () => {
  const stateSymbol = Symbol('state');
  const state = { distance: 10, [stateSymbol]: 'kept' };
  Object.defineProperty(state, 'hidden', { value: 'omitted' });
  const scenarios = Object.create({ inherited: { distance: 0 } });
  Object.defineProperty(scenarios, 'hidden', { value: state });
  scenarios[Symbol('scenario')] = state;
  Object.defineProperty(scenarios, '__proto__', {
    value: state,
    enumerable: true,
  });
  const descriptors = createScenarioDescriptors(scenarios);
  assert.deepEqual(Object.keys(descriptors), ['__proto__']);
  assert.equal(Object.getPrototypeOf(descriptors), Object.prototype);
  assert.equal(Object.hasOwn(descriptors, '__proto__'), true);
  assert.equal(descriptors.__proto__.state[stateSymbol], 'kept');
  assert.equal(Object.hasOwn(descriptors.__proto__.state, 'hidden'), false);
});

test('missing scenario dictionaries retain their existing TypeError behavior', () => {
  assert.throws(() => createScenarioDescriptors(null), TypeError);
  assert.throws(() => createScenarioDescriptors(undefined), TypeError);
  assert.deepEqual(createScenarioDescriptors({}), {});
});
