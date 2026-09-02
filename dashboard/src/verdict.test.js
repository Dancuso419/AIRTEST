import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerdict } from './verdict.js';

function scenario(standard, perUser) {
  return {
    standard,
    aggregates: { per_user_throughput_mbps: { mean: perUser, std: 0 } },
  };
}

test('names both figures and the percentage difference', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 1.6),
    wifi6: scenario('wifi6', 2.4),
    clients: 60,
    trafficType: 'video',
  });
  assert.match(s, /60 students/);
  assert.match(s, /streaming video/i);
  assert.match(s, /1\.6/);
  assert.match(s, /2\.4/);
  assert.match(s, /50%/);
  assert.match(s, /WiFi 6/);
});

test('says both cope when the difference is under five percent', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 2.00),
    wifi6: scenario('wifi6', 2.04),
    clients: 20,
    trafficType: 'video',
  });
  assert.match(s, /no meaningful difference|both/i);
  assert.doesNotMatch(s, /more/);
});

test('reports WiFi 5 ahead when it actually is', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 3.0),
    wifi6: scenario('wifi6', 2.0),
    clients: 40,
    trafficType: 'bulk',
  });
  assert.match(s, /WiFi 5/);
  assert.match(s, /50%/);
});

test('returns an explicit no-data sentence when a standard is missing', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 2.0),
    wifi6: null,
    clients: 40,
    trafficType: 'video',
  });
  assert.match(s, /not been simulated|no data/i);
  assert.doesNotMatch(s, /%/);
});

test('does not divide by zero when both are zero', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 0),
    wifi6: scenario('wifi6', 0),
    clients: 200,
    trafficType: 'video',
  });
  assert.ok(typeof s === 'string' && s.length > 0);
  assert.doesNotMatch(s, /NaN|Infinity/);
});

test('does not divide by zero when only WiFi 5 is zero', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 0),
    wifi6: scenario('wifi6', 2.0),
    clients: 80,
    trafficType: 'video',
  });
  assert.doesNotMatch(s, /NaN|Infinity/);
  assert.doesNotMatch(s, /%/);
});

test('does not divide by zero when only WiFi 6 is zero', () => {
  const s = buildVerdict({
    wifi5: scenario('wifi5', 2.0),
    wifi6: scenario('wifi6', 0),
    clients: 80,
    trafficType: 'video',
  });
  assert.doesNotMatch(s, /NaN|Infinity/);
  assert.doesNotMatch(s, /%/);
});
