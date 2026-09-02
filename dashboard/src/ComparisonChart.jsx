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
        <CartesianGrid strokeDasharray="3 3" stroke="#22272c" />
        <XAxis
          dataKey="clients"
          type="number"
          domain={['dataMin', 'dataMax']}
          label={{ value: 'Client density (stations)', position: 'insideBottom', offset: -24 }}
          stroke="#8b969b"
          tick={{ fill: '#8b969b', fontSize: 12 }}
        />
        <YAxis
          label={{
            value: `${metric.label} (${metric.unit})`,
            angle: -90,
            position: 'insideLeft',
            offset: -12,
            style: { textAnchor: 'middle' },
          }}
          stroke="#8b969b"
          tick={{ fill: '#8b969b', fontSize: 12 }}
        />
        <Tooltip
          // Recharts ships a white tooltip; on a panel-black ground that is a
          // white box of invisible white text. Theme it like the instrument.
          contentStyle={{
            background: '#0f1114',
            border: '1px solid #2a2d31',
            borderRadius: 3,
            fontFamily: "'JetBrains Mono Variable', monospace",
            fontSize: 12,
          }}
          labelStyle={{
            color: '#f2f5f5',
            fontFamily: "'Saira Variable', sans-serif",
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontSize: 11,
            marginBottom: 6,
          }}
          itemStyle={{ color: '#8b969b' }}
          cursor={{ stroke: '#2a2d31', strokeWidth: 1 }}
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
          fill="#f2f5f5"
          fillOpacity={0.15}
        />
        <Area
          dataKey="wifi6_band"
          name={`${STANDARD_LABELS.wifi6} ±1 SD`}
          stroke="none"
          fill="#7cff9e"
          fillOpacity={0.15}
        />
        <Line
          dataKey="wifi5_mean"
          name={STANDARD_LABELS.wifi5}
          stroke="#f2f5f5"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 4 }}
        />
        <Line
          dataKey="wifi6_mean"
          name={STANDARD_LABELS.wifi6}
          stroke="#7cff9e"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
