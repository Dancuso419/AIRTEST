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
        <CartesianGrid strokeDasharray="3 3" stroke="#e1e7e3" />
        <XAxis
          dataKey="clients"
          type="number"
          domain={['dataMin', 'dataMax']}
          label={{ value: 'Client density (stations)', position: 'insideBottom', offset: -24 }}
          stroke="#5f6f67"
          tick={{ fill: '#5f6f67', fontSize: 12 }}
        />
        <YAxis
          label={{
            value: `${metric.label} (${metric.unit})`,
            angle: -90,
            position: 'insideLeft',
            offset: -12,
            style: { textAnchor: 'middle' },
          }}
          stroke="#5f6f67"
          tick={{ fill: '#5f6f67', fontSize: 12 }}
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
          fill="#4e9e6e"
          fillOpacity={0.15}
        />
        <Area
          dataKey="wifi6_band"
          name={`${STANDARD_LABELS.wifi6} ±1 SD`}
          stroke="none"
          fill="#0f3d26"
          fillOpacity={0.15}
        />
        <Line
          dataKey="wifi5_mean"
          name={STANDARD_LABELS.wifi5}
          stroke="#4e9e6e"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 4 }}
        />
        <Line
          dataKey="wifi6_mean"
          name={STANDARD_LABELS.wifi6}
          stroke="#0f3d26"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
