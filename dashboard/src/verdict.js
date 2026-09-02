import { TRAFFIC_LABELS } from './metrics.js';

// Below this relative gap the two standards are reported as equivalent rather
// than as one "winning". At low densities neither standard is stressed, and
// manufacturing a contrast there would misrepresent the data.
const MEANINGFUL_DIFFERENCE = 0.05;

function perUser(scenarioObj) {
  return scenarioObj?.aggregates?.per_user_throughput_mbps?.mean ?? null;
}

export function buildVerdict({ wifi5, wifi6, clients, trafficType }) {
  const activity = (TRAFFIC_LABELS[trafficType] ?? trafficType).toLowerCase();
  const setting = `At ${clients} students ${activity}`;

  const a = perUser(wifi5);
  const b = perUser(wifi6);

  if (a === null || b === null) {
    return `${setting}, this combination has not been simulated yet.`;
  }

  const best = Math.max(a, b);
  if (best === 0) {
    return `${setting}, neither standard delivered any usable throughput.`;
  }

  const gap = Math.abs(a - b) / best;
  if (gap < MEANINGFUL_DIFFERENCE) {
    return (
      `${setting}, both standards deliver about ${a.toFixed(1)} Mbps per ` +
      `student — no meaningful difference at this density.`
    );
  }

  const leaderIsSix = b > a;
  const leader = leaderIsSix ? 'WiFi 6' : 'WiFi 5';
  const lead = leaderIsSix ? b : a;
  const trail = leaderIsSix ? a : b;
  const other = leaderIsSix ? 'WiFi 5' : 'WiFi 6';

  if (trail === 0) {
    return (
      `${setting}, ${other} delivered no usable throughput while ${leader} ` +
      `gave each student ${lead.toFixed(1)} Mbps.`
    );
  }

  const pct = Math.round(((lead - trail) / trail) * 100);

  return (
    `${setting}, ${leader} gives each student ${lead.toFixed(1)} Mbps ` +
    `versus ${other}'s ${trail.toFixed(1)} Mbps — about ${pct}% more.`
  );
}
