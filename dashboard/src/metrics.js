// Each metric carries a technical label (for the explorer chart), a plain
// label and explanation (for the results view), its unit, and its direction.
// Keys must match results.json exactly and must never be renamed here.
export const METRICS = [
  {
    key: 'per_user_throughput_mbps',
    label: 'Per-user throughput',
    plainLabel: 'Speed per student',
    explanation: 'what one person actually gets',
    unit: 'Mbps',
    betterWhen: 'higher',
    headline: true,
  },
  {
    key: 'aggregate_throughput_mbps',
    label: 'Aggregate throughput',
    plainLabel: 'Total speed',
    explanation: 'the whole room combined',
    unit: 'Mbps',
    betterWhen: 'higher',
  },
  {
    key: 'latency_ms',
    label: 'Latency (delivered packets)',
    plainLabel: 'Lag',
    explanation: 'delay before things respond',
    unit: 'ms',
    betterWhen: 'lower',
  },
  {
    key: 'jitter_ms',
    label: 'Jitter (delivered packets)',
    plainLabel: 'Jitter',
    explanation: 'how much the delay varies',
    unit: 'ms',
    betterWhen: 'lower',
  },
  {
    key: 'packet_loss_pct',
    label: 'Packet loss',
    plainLabel: 'Data lost',
    explanation: 'what never arrived',
    unit: '%',
    betterWhen: 'lower',
  },
  {
    key: 'satisfaction_ratio_pct',
    label: 'Offered-load satisfaction',
    plainLabel: 'Demand met',
    explanation: 'share of what was asked for',
    unit: '%',
    betterWhen: 'higher',
  },
  {
    key: 'fairness_index',
    label: "Jain's fairness index",
    plainLabel: 'Fairness',
    explanation: 'does everyone get an equal share',
    unit: '0-1',
    betterWhen: 'higher',
  },
  // Lower airtime for the same delivered throughput is the WiFi 6
  // efficiency advantage this study exists to measure.
  {
    key: 'airtime_utilization_pct',
    label: 'Airtime utilization',
    plainLabel: 'Airwave usage',
    explanation: 'how congested the channel is',
    unit: '%',
    betterWhen: 'lower',
  },
];

export const TRAFFIC_LABELS = {
  web: 'Browsing the web',
  video: 'Streaming video',
  bulk: 'Downloading files',
};

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
