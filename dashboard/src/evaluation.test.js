import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMetric, buildEvaluation } from './evaluation.js';

const HIGHER = { key: 'per_user_throughput_mbps', plainLabel: 'Speed per student',
                 unit: 'Mbps', betterWhen: 'higher' };
const LOWER = { key: 'latency_ms', plainLabel: 'Lag', unit: 'ms', betterWhen: 'lower' };
const INDEX = { key: 'fairness_index', plainLabel: 'Fairness', unit: '0-1',
                betterWhen: 'higher' };

const agg = (mean, std = 0) => ({ mean, std });

test('a gap inside the run-to-run spread is not a win', () => {
  // 4.0 vs 4.6 is a 15% gap, but the seeds themselves disagree by +/-0.4.
  const row = compareMetric(HIGHER, agg(4.0, 0.4), agg(4.6, 0.4));
  assert.equal(row.winner, 'tie');
  assert.match(row.sentence, /repeat runs/);
});

test('the same gap IS a win once the seeds agree with themselves', () => {
  const row = compareMetric(HIGHER, agg(4.0, 0.01), agg(4.6, 0.01));
  assert.equal(row.winner, 'wifi6');
});

test('a gap under the relative floor is a tie however tight the seeds', () => {
  const row = compareMetric(HIGHER, agg(4.0, 0), agg(4.1, 0));
  assert.equal(row.winner, 'tie');
});

test('lower-is-better inverts who wins', () => {
  const row = compareMetric(LOWER, agg(7.5, 0.1), agg(22.0, 0.1));
  assert.equal(row.winner, 'wifi5');
});

// The bug this file exists for: the percentage in a lower-is-better sentence
// must be measured against the value the sentence starts from, not the other
// one. 7.5 -> 22.0 is 193% higher, not 66%.
test('lower-is-better percentage is measured against the winning value', () => {
  const row = compareMetric(LOWER, agg(7.5, 0.1), agg(22.0, 0.1));
  assert.match(row.sentence, /193% higher/);
});

test('higher-is-better percentage is measured against the losing value', () => {
  const row = compareMetric(HIGHER, agg(4.4, 0.01), agg(5.0, 0.01));
  assert.match(row.sentence, /14% more/);
});

test('a zero reference never prints Infinity or NaN', () => {
  const row = compareMetric(LOWER, agg(0, 0), agg(5, 0));
  assert.equal(row.winner, 'wifi5');
  assert.doesNotMatch(row.sentence, /Infinity|NaN/);
});

test('both at zero is a tie, not a win for either', () => {
  assert.equal(compareMetric(HIGHER, agg(0, 0), agg(0, 0)).winner, 'tie');
});

test('a metric with no data produces no row at all', () => {
  assert.equal(compareMetric(HIGHER, undefined, agg(4, 0)), null);
  assert.equal(compareMetric(HIGHER, agg(4, 0), { std: 0 }), null);
});

test('the fairness index prints no spoken unit', () => {
  const row = compareMetric(INDEX, agg(0.92, 0.001), agg(1.0, 0.001));
  assert.doesNotMatch(row.sentence, /0-1/);
  assert.match(row.sentence, /1\.00/);
});

const scenario = (values) => ({
  aggregates: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, agg(v, 0)])),
});

test('the headline follows the tally', () => {
  const five = scenario({ per_user_throughput_mbps: 2, latency_ms: 50 });
  const six = scenario({ per_user_throughput_mbps: 4, latency_ms: 10 });
  const ev = buildEvaluation({ wifi5: five, wifi6: six, clients: 20,
                               trafficType: 'video', aps: 1 });
  assert.equal(ev.tally.wifi6, 2);
  assert.match(ev.headline, /^WiFi 6 is the better choice/);
  assert.match(ev.room, /20 students streaming video on a single access point/);
});

test('an even split is reported as no clear winner', () => {
  const five = scenario({ per_user_throughput_mbps: 4, latency_ms: 50 });
  const six = scenario({ per_user_throughput_mbps: 2, latency_ms: 10 });
  const ev = buildEvaluation({ wifi5: five, wifi6: six, clients: 20,
                               trafficType: 'web', aps: 1 });
  assert.match(ev.headline, /neither standard is clearly better/);
});

test('a single tie reads as singular', () => {
  const both = scenario({ per_user_throughput_mbps: 4 });
  const ev = buildEvaluation({ wifi5: both, wifi6: both, clients: 10,
                               trafficType: 'web', aps: 1 });
  assert.match(ev.bottomLine, /1 was too close to call/);
});

test('multiple access points are named in the setting', () => {
  const both = scenario({ per_user_throughput_mbps: 4 });
  const ev = buildEvaluation({ wifi5: both, wifi6: both, clients: 20,
                               trafficType: 'bulk', aps: 3 });
  assert.match(ev.room, /with 3 access points/);
});

// The cost note must not credit WiFi 6 with buying anything when it lost on
// every delivery measure as well.
test('spending more airwaves for nothing is said plainly', () => {
  const five = scenario({ airtime_utilization_pct: 62, satisfaction_ratio_pct: 100,
                          per_user_throughput_mbps: 5 });
  const six = scenario({ airtime_utilization_pct: 82, satisfaction_ratio_pct: 88,
                         per_user_throughput_mbps: 4.4 });
  const ev = buildEvaluation({ wifi5: five, wifi6: six, clients: 20,
                               trafficType: 'bulk', aps: 1 });
  assert.match(ev.note, /did not deliver more/);
});

test('spending more airwaves to serve more is credited', () => {
  const five = scenario({ airtime_utilization_pct: 34, satisfaction_ratio_pct: 90 });
  const six = scenario({ airtime_utilization_pct: 51, satisfaction_ratio_pct: 97 });
  const ev = buildEvaluation({ wifi5: five, wifi6: six, clients: 20,
                               trafficType: 'bulk', aps: 3 });
  assert.match(ev.note, /keeping everyone served/);
});

test('an unsimulated combination yields no rows and says so', () => {
  const ev = buildEvaluation({ wifi5: null, wifi6: null, clients: 40,
                               trafficType: 'web', aps: 1 });
  assert.equal(ev.rows.length, 0);
  assert.match(ev.headline, /not been simulated/);
  assert.equal(ev.bottomLine, null);
});
