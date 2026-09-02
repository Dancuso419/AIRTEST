import { useState } from 'react';
import results from './data/results.json';
import ComparisonChart from './ComparisonChart';
import { METRICS } from './metrics';

export default function App() {
  const [metricKey, setMetricKey] = useState(METRICS[0].key);
  const metric = METRICS.find((m) => m.key === metricKey);

  const topologies = [...new Set(results.scenarios.map((s) => s.topology))];
  const trafficTypes = [...new Set(results.scenarios.map((s) => s.traffic_type))];
  const [topology, setTopology] = useState(topologies[0]);
  const [trafficType, setTrafficType] = useState(trafficTypes[0]);

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>WiFi 5 vs WiFi 6 in dense lecture theatres</h1>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
        <label>
          Metric{' '}
          <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
        <label>
          Topology{' '}
          <select value={topology} onChange={(e) => setTopology(e.target.value)}>
            {topologies.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Traffic{' '}
          <select value={trafficType} onChange={(e) => setTrafficType(e.target.value)}>
            {trafficTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <p style={{ color: '#555' }}>
        {metric.label} ({metric.unit}) —{' '}
        {metric.betterWhen === 'higher' ? 'higher is better' : 'lower is better'}.{' '}
        Shaded bands show ±1 standard deviation across trials.
      </p>

      {metric.key === 'airtime_utilization_pct' && (
        <p style={{ color: '#555', fontStyle: 'italic' }}>
          Read airtime alongside throughput — lower airtime for the same delivered
          throughput is the efficiency win, not lower airtime on its own.
        </p>
      )}

      <ComparisonChart
        scenarios={results.scenarios}
        topology={topology}
        trafficType={trafficType}
        metric={metric}
      />

      {results.meta.warnings.length > 0 && (
        <section style={{ marginTop: '2rem', padding: '1rem', background: '#fff8e1' }}>
          <strong>Dataset warnings</strong>
          <ul>
            {results.meta.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
