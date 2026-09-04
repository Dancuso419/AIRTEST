import { METRICS, TRAFFIC_LABELS } from './metrics.js';

/**
 * The plain-language evaluation printed at the end of a run.
 *
 * Two rules govern every sentence here:
 *
 * 1. No manufactured contrast. A difference smaller than the run-to-run
 *    spread is not a finding, it is noise, and it is reported as "too close
 *    to call" rather than as a winner. This is the whole reason the study
 *    runs multiple seeds.
 * 2. No jargon. The reader wants to know whether the lecture theatre works,
 *    not how it was measured. "Airwave usage", not "airtime utilization";
 *    "held it to 2.7 ms", not "mean conditional latency".
 */

/** Relative floor. Below this the two are equivalent for a room of students. */
const RELATIVE_TIE = 0.05;

const decimals = (metric) => (metric.unit === '0-1' ? 2 : 1);

const say = (metric, v) => v.toFixed(decimals(metric));

/** "1.00 0-1" is not something anyone says, so the fairness index gets no
    unit at all; a percent sign hugs its number rather than standing off it. */
const unitOf = (metric) => {
  if (metric.unit === '0-1') return '';
  return metric.unit === '%' ? '%' : ` ${metric.unit}`;
};

/**
 * Compare one metric across the two standards.
 *
 * Returns null when either side has no data, so an unsimulated cell produces
 * no row at all rather than a row of dashes that still looks like a reading.
 */
export function compareMetric(metric, agg5, agg6) {
  const m5 = agg5?.mean;
  const m6 = agg6?.mean;
  if (typeof m5 !== 'number' || typeof m6 !== 'number') return null;

  const gap = Math.abs(m6 - m5);
  const scale = Math.max(Math.abs(m5), Math.abs(m6));
  // The seeds already disagree with themselves by this much, so a gap inside
  // it cannot be credited to the standard.
  const spread = (agg5?.std ?? 0) + (agg6?.std ?? 0);
  const tie = scale === 0 || gap <= spread || gap / scale < RELATIVE_TIE;

  const base = {
    key: metric.key,
    label: metric.plainLabel,
    unit: metric.unit,
    value5: m5,
    value6: m6,
  };

  if (tie) {
    return {
      ...base,
      winner: 'tie',
      sentence:
        scale === 0
          ? 'Neither standard registered anything here.'
          : `Both came out around ${say(metric, m5)}${unitOf(metric)}. The gap is ` +
            'smaller than the difference between repeat runs, so neither is ahead.',
    };
  }

  const higherWins = metric.betterWhen === 'higher';
  const winner = (higherWins ? m6 > m5 : m6 < m5) ? 'wifi6' : 'wifi5';
  const winnerName = winner === 'wifi6' ? 'WiFi 6' : 'WiFi 5';
  const loserName = winner === 'wifi6' ? 'WiFi 5' : 'WiFi 6';
  const hi = Math.max(m5, m6);
  const lo = Math.min(m5, m6);
  const good = higherWins ? hi : lo;
  const bad = higherWins ? lo : hi;

  // The denominator is whichever value the sentence treats as the reference,
  // NOT always the worse one. "5.0 where the other gave 4.4, 13% more" is
  // measured against 4.4; "held it to 7.5 while the other ran up to 22.0,
  // higher" is measured against 7.5. Using the loser's figure in both cases
  // printed 7.5 vs 22.0 as "66% higher" instead of 193%.
  const reference = higherWins ? bad : good;
  const pct =
    reference === 0 ? null : Math.round((Math.abs(good - bad) / reference) * 100);

  const sentence = higherWins
    ? `${winnerName} gave ${say(metric, good)}${unitOf(metric)} where ${loserName} ` +
      `gave ${say(metric, bad)}` +
      (pct === null ? ', which was nothing at all.' : ` — ${pct}% more.`)
    : `${winnerName} held it to ${say(metric, good)}${unitOf(metric)} while ` +
      `${loserName} ran up to ${say(metric, bad)}` +
      (pct === null ? '.' : ` — ${pct}% higher.`);

  return { ...base, winner, sentence };
}

/**
 * Full evaluation for one set of conditions.
 *
 * `rows` follows METRICS order, so the reading starts with the figure a
 * student actually feels and ends with the cost of delivering it.
 */
export function buildEvaluation({ wifi5, wifi6, clients, trafficType, aps }) {
  const rows = METRICS
    .map((m) => compareMetric(m, wifi5?.aggregates?.[m.key], wifi6?.aggregates?.[m.key]))
    .filter(Boolean);

  const tally = {
    wifi5: rows.filter((r) => r.winner === 'wifi5').length,
    wifi6: rows.filter((r) => r.winner === 'wifi6').length,
    tie: rows.filter((r) => r.winner === 'tie').length,
  };

  const activity = (TRAFFIC_LABELS[trafficType] ?? trafficType).toLowerCase();
  const room =
    `${clients} students ${activity}` +
    (aps > 1 ? ` with ${aps} access points` : ' on a single access point');

  if (rows.length === 0) {
    return {
      rows, tally, room,
      headline: 'This combination has not been simulated yet.',
      bottomLine: null,
      note: null,
    };
  }

  let headline;
  if (tally.wifi6 > tally.wifi5) {
    headline = `WiFi 6 is the better choice for ${room}.`;
  } else if (tally.wifi5 > tally.wifi6) {
    headline = `WiFi 5 is the better choice for ${room}.`;
  } else {
    headline = `For ${room}, neither standard is clearly better.`;
  }

  const counted = [
    `WiFi 6 came out ahead on ${tally.wifi6} of ${rows.length} measures`,
    `WiFi 5 on ${tally.wifi5}`,
    tally.tie ? `and ${tally.tie} ${tally.tie === 1 ? 'was' : 'were'} too close to call` : null,
  ].filter(Boolean);

  // The cost sentence. WiFi 6 routinely buys its delivery with far more
  // airwave, and an evaluation that counted wins without saying so would be
  // telling half the story.
  const air = rows.find((r) => r.key === 'airtime_utilization_pct');
  const servedBetter = ['satisfaction_ratio_pct', 'packet_loss_pct', 'per_user_throughput_mbps']
    .some((k) => rows.find((r) => r.key === k)?.winner === 'wifi6');
  const note =
    air && air.winner === 'wifi5'
      ? 'Worth knowing: WiFi 6 used more of the available airwaves ' +
        `(${air.value6.toFixed(0)}% against ${air.value5.toFixed(0)}%). ` +
        (servedBetter
          // Only claim the airwaves bought something if they demonstrably did.
          ? 'That is the price it pays for keeping everyone served.'
          : 'Here it spent more and did not deliver more.')
      : null;

  return { rows, tally, room, headline, bottomLine: `${counted.join(', ')}.`, note };
}
