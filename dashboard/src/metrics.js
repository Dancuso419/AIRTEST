// Every metric carries its unit and its direction, so charts can always be
// labelled correctly and "higher is better" is never assumed.
export const METRICS = [
  { key: 'aggregate_throughput_mbps', label: 'Aggregate throughput', unit: 'Mbps', betterWhen: 'higher' },
  { key: 'per_user_throughput_mbps', label: 'Per-user throughput', unit: 'Mbps', betterWhen: 'higher' },
  { key: 'latency_ms', label: 'Latency', unit: 'ms', betterWhen: 'lower' },
  { key: 'jitter_ms', label: 'Jitter', unit: 'ms', betterWhen: 'lower' },
  { key: 'packet_loss_pct', label: 'Packet loss', unit: '%', betterWhen: 'lower' },
  { key: 'satisfaction_ratio_pct', label: 'Offered-load satisfaction', unit: '%', betterWhen: 'higher' },
  { key: 'fairness_index', label: "Jain's fairness index", unit: '0-1', betterWhen: 'higher' },
  // Lower airtime for the same delivered throughput is the WiFi 6 efficiency
  // advantage this study is looking for, so lower is better here.
  { key: 'airtime_utilization_pct', label: 'Airtime utilization', unit: '%', betterWhen: 'lower' },
];

export const STANDARD_LABELS = {
  wifi5: 'WiFi 5 (802.11ac)',
  wifi6: 'WiFi 6 (802.11ax)',
};

/**
 * Reshape scenarios into one row per client density, with a mean and a
 * [low, high] std-dev band per standard, which is the shape Recharts's
 * Area-based error band needs.
 */
export function toChartRows(scenarios, { topology, trafficType, metricKey }) {
  const matching = scenarios.filter(
    (s) => s.topology === topology && s.traffic_type === trafficType
  );

  const byDensity = new Map();
  for (const s of matching) {
    const agg = s.aggregates[metricKey];
    if (!agg) continue;
    const row = byDensity.get(s.clients) ?? { clients: s.clients };
    row[`${s.standard}_mean`] = agg.mean;
    row[`${s.standard}_band`] = [
      Number((agg.mean - agg.std).toFixed(3)),
      Number((agg.mean + agg.std).toFixed(3)),
    ];
    byDensity.set(s.clients, row);
  }

  return [...byDensity.values()].sort((a, b) => a.clients - b.clients);
}
