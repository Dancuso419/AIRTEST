import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STANDARD_LABELS, toChartRows } from './metrics';

export default function ComparisonChart({
  scenarios,
  topology,
  trafficType,
  metric,
}) {
  const rows = toChartRows(scenarios, {
    topology,
    trafficType,
    metricKey: metric.key,
  });

  if (rows.length === 0) {
    return <p>No data for this filter combination.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={420}>
      <ComposedChart data={rows} margin={{ top: 16, right: 24, bottom: 48, left: 56 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="clients"
          type="number"
          domain={['dataMin', 'dataMax']}
          label={{ value: 'Client density (stations)', position: 'insideBottom', offset: -24 }}
        />
        <YAxis
          label={{
            value: `${metric.label} (${metric.unit})`,
            angle: -90,
            position: 'insideLeft',
            offset: -12,
            style: { textAnchor: 'middle' },
          }}
        />
        <Tooltip
          formatter={(value, name) =>
            Array.isArray(value)
              ? [`${value[0]} - ${value[1]} ${metric.unit}`, `${name} (±1 SD)`]
              : [`${value} ${metric.unit}`, name]
          }
          labelFormatter={(v) => `${v} clients`}
        />
        <Legend verticalAlign="top" height={36} />

        <Area
          dataKey="wifi5_band"
          name={`${STANDARD_LABELS.wifi5} ±1 SD`}
          stroke="none"
          fill="#1f77b4"
          fillOpacity={0.15}
        />
        <Area
          dataKey="wifi6_band"
          name={`${STANDARD_LABELS.wifi6} ±1 SD`}
          stroke="none"
          fill="#d62728"
          fillOpacity={0.15}
        />
        <Line
          dataKey="wifi5_mean"
          name={STANDARD_LABELS.wifi5}
          stroke="#1f77b4"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
        <Line
          dataKey="wifi6_mean"
          name={STANDARD_LABELS.wifi6}
          stroke="#d62728"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
