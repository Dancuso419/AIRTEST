// Access-point count is what a viewer understands; topology is what the
// dataset stores. This is the only place the two vocabularies meet.
export const TOPOLOGY_BY_APS = { 1: 'single_ap', 3: 'multi_ap' };

const APS_BY_TOPOLOGY = { single_ap: 1, multi_ap: 3 };

/**
 * Every selectable value, derived from the data rather than hardcoded, so new
 * options appear as the simulation matrix grows without a frontend change.
 */
export function availableConditions(scenarios) {
  const clients = new Set();
  const trafficTypes = new Set();
  const apCounts = new Set();

  for (const s of scenarios) {
    clients.add(s.clients);
    trafficTypes.add(s.traffic_type);
    const aps = APS_BY_TOPOLOGY[s.topology];
    if (aps !== undefined) apCounts.add(aps);
  }

  return {
    clients: [...clients].sort((a, b) => a - b),
    trafficTypes: [...trafficTypes].sort(),
    apCounts: [...apCounts].sort((a, b) => a - b),
  };
}

export function findScenario(scenarios, { clients, trafficType, aps, standard }) {
  const topology = TOPOLOGY_BY_APS[aps];
  return (
    scenarios.find(
      (s) =>
        s.clients === clients &&
        s.traffic_type === trafficType &&
        s.topology === topology &&
        s.standard === standard,
    ) ?? null
  );
}

/**
 * A combination is only usable if BOTH standards were simulated for it — the
 * whole point of the view is the comparison, and showing one standard alone
 * would invite a reader to infer the other.
 */
export function isCombinationAvailable(scenarios, { clients, trafficType, aps }) {
  return (
    findScenario(scenarios, { clients, trafficType, aps, standard: 'wifi5' }) !== null &&
    findScenario(scenarios, { clients, trafficType, aps, standard: 'wifi6' }) !== null
  );
}

/**
 * Choose one stored trial. `excludeSeed` supports "run again": it picks a
 * different seed so the numbers visibly change, which is the point of the
 * interaction. With only one trial it returns that trial rather than pretending.
 */
export function pickTrial(scenario, { excludeSeed = null, rng = Math.random } = {}) {
  const trials = scenario?.trials ?? [];
  if (trials.length === 0) return null;

  const candidates =
    excludeSeed === null ? trials : trials.filter((t) => t.seed !== excludeSeed);
  const pool = candidates.length > 0 ? candidates : trials;

  return pool[Math.floor(rng() * pool.length) % pool.length];
}
