import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableConditions,
  findScenario,
  isCombinationAvailable,
  pickTrial,
  TOPOLOGY_BY_APS,
} from './scenarios.js';

function sc(standard, clients, traffic, topology, trials) {
  return {
    standard,
    clients,
    traffic_type: traffic,
    topology,
    trials: trials.map((seed) => ({ seed, per_user_throughput_mbps: seed })),
    aggregates: { per_user_throughput_mbps: { mean: 1, std: 0 } },
  };
}

const DATA = [
  sc('wifi5', 10, 'video', 'single_ap', [1, 2]),
  sc('wifi6', 10, 'video', 'single_ap', [1, 2]),
  sc('wifi5', 20, 'video', 'single_ap', [1, 2]),
  sc('wifi6', 20, 'video', 'single_ap', [1]),
  sc('wifi5', 20, 'web', 'multi_ap', [1, 2]),
];

test('available conditions are derived from the data, sorted', () => {
  const a = availableConditions(DATA);
  assert.deepEqual(a.clients, [10, 20]);
  assert.deepEqual(a.trafficTypes, ['video', 'web']);
  assert.deepEqual(a.apCounts, [1, 3]);
});

test('available conditions are empty for an empty dataset', () => {
  const a = availableConditions([]);
  assert.deepEqual(a.clients, []);
  assert.deepEqual(a.trafficTypes, []);
  assert.deepEqual(a.apCounts, []);
});

test('findScenario matches on all four fields', () => {
  const s = findScenario(DATA, {
    clients: 10, trafficType: 'video', aps: 1, standard: 'wifi6',
  });
  assert.equal(s.standard, 'wifi6');
  assert.equal(s.clients, 10);
});

test('findScenario returns null rather than a near match', () => {
  const s = findScenario(DATA, {
    clients: 14, trafficType: 'video', aps: 1, standard: 'wifi6',
  });
  assert.equal(s, null);
});

test('findScenario maps 3 access points to multi_ap', () => {
  const s = findScenario(DATA, {
    clients: 20, trafficType: 'web', aps: 3, standard: 'wifi5',
  });
  assert.equal(s.topology, 'multi_ap');
});

test('a combination needs BOTH standards to count as available', () => {
  assert.equal(
    isCombinationAvailable(DATA, { clients: 10, trafficType: 'video', aps: 1 }),
    true,
  );
  // wifi6 exists at 20/video/1ap, wifi5 exists — available
  assert.equal(
    isCombinationAvailable(DATA, { clients: 20, trafficType: 'video', aps: 1 }),
    true,
  );
  // only wifi5 exists for web/multi_ap — not a comparison
  assert.equal(
    isCombinationAvailable(DATA, { clients: 20, trafficType: 'web', aps: 3 }),
    false,
  );
});

test('pickTrial avoids the excluded seed when another exists', () => {
  const scenarioObj = DATA[0];
  const t = pickTrial(scenarioObj, { excludeSeed: 1, rng: () => 0 });
  assert.equal(t.seed, 2);
});

test('pickTrial returns the only trial when it cannot avoid the seed', () => {
  const single = DATA[3]; // wifi6, 20 clients, one trial
  const t = pickTrial(single, { excludeSeed: 1, rng: () => 0 });
  assert.equal(t.seed, 1);
});

test('pickTrial returns null for a scenario with no trials', () => {
  assert.equal(pickTrial({ trials: [] }), null);
  assert.equal(pickTrial(null), null);
});

test('TOPOLOGY_BY_APS maps both supported values', () => {
  assert.equal(TOPOLOGY_BY_APS[1], 'single_ap');
  assert.equal(TOPOLOGY_BY_APS[3], 'multi_ap');
});
