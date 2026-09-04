import { memo } from 'react';
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

function ComparisonChart({
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
        <CartesianGrid strokeDasharray="3 3" stroke="#e3ded3" />
        <XAxis
          dataKey="clients"
          // Tick only at densities that were actually simulated. The numeric
          // axis otherwise auto-ticks to 13, 16, 19 — values no run exists
          // for, which invites reading the line between points as data.
          ticks={rows.map((r) => r.clients)}
          type="number"
          domain={['dataMin', 'dataMax']}
          label={{ value: 'Client density (stations)', position: 'insideBottom', offset: -24 }}
          stroke="#8b867c"
          tick={{ fill: '#8b867c', fontSize: 12 }}
        />
        <YAxis
          label={{
            value: `${metric.label} (${metric.unit})`,
            angle: -90,
            position: 'insideLeft',
            offset: -12,
            style: { textAnchor: 'middle' },
          }}
          stroke="#8b867c"
          tick={{ fill: '#8b867c', fontSize: 12 }}
        />
        <Tooltip
          // Recharts ships a white tooltip; on a panel-black ground that is a
          // white box of invisible white text. Theme it like the instrument.
          contentStyle={{
            background: '#ffffff',
            border: '1px solid #cfc8b9',
            borderRadius: 3,
            fontFamily: "'JetBrains Mono Variable', monospace",
            fontSize: 12,
          }}
          labelStyle={{
            color: '#16181d',
            fontFamily: "'Archivo Variable', sans-serif",
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontSize: 11,
            marginBottom: 6,
          }}
          itemStyle={{ color: '#56534c' }}
          cursor={{ stroke: '#cfc8b9', strokeWidth: 1 }}
          formatter={(value, name) =>
            Array.isArray(value)
              ? [`${value[0]} - ${value[1]} ${metric.unit}`, `${name} (±1 SD)`]
              : [`${value} ${metric.unit}`, name]
          }
          labelFormatter={(v) => `${v} clients`}
        />
        <Legend verticalAlign="top" height={36} />

        <Area
          legendType="none"
          dataKey="wifi5_band"
          name={`${STANDARD_LABELS.wifi5} ±1 SD`}
          stroke="none"
          fill="#16181d"
          fillOpacity={0.15}
        />
        <Area
          legendType="none"
          dataKey="wifi6_band"
          name={`${STANDARD_LABELS.wifi6} ±1 SD`}
          stroke="none"
          fill="#0d8f6f"
          fillOpacity={0.15}
        />
        <Line
          dataKey="wifi5_mean"
          name={STANDARD_LABELS.wifi5}
          stroke="#16181d"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 4 }}
        />
        <Line
          dataKey="wifi6_mean"
          name={STANDARD_LABELS.wifi6}
          stroke="#0d8f6f"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Memoised because the replay sets state roughly sixty times a second, and
 * without this the whole Recharts SVG was rebuilt on every one of those
 * frames while none of its inputs had changed. Its props are all stable
 * during a replay: `scenarios` comes straight from the imported dataset and
 * `metric` is an object out of the module-level METRICS array, so both keep
 * their identity across renders and the default shallow compare holds.
 */
export default memo(ComparisonChart);
