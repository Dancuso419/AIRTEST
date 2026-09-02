import { useMemo, useState } from 'react';
import results from './data/results.json';
import ComparisonChart from './ComparisonChart';
import ConditionsPanel from './ConditionsPanel';
import { METRICS } from './metrics';
import { availableConditions, findScenario, isCombinationAvailable, pickTrial } from './scenarios';
import { buildVerdict } from './verdict';

export default function App() {
  const scenarios = results.scenarios;
  const options = useMemo(() => availableConditions(scenarios), [scenarios]);

  const [conditions, setConditions] = useState({
    clients: options.clients[0],
    trafficType: options.trafficTypes[0],
    aps: options.apCounts[0],
  });
  const [phase, setPhase] = useState('setup');
  const [run, setRun] = useState(null);
  // The explorer chart keeps its own metric selection, independent of the
  // simulator's conditions — it is the technical view, not the plain one.
  const [explorerMetricKey, setExplorerMetricKey] = useState('per_user_throughput_mbps');

  const available = isCombinationAvailable(scenarios, conditions);

  function start(excludeSeed = null) {
    const wifi5 = findScenario(scenarios, { ...conditions, standard: 'wifi5' });
    const wifi6 = findScenario(scenarios, { ...conditions, standard: 'wifi6' });
    const t5 = pickTrial(wifi5, { excludeSeed });
    const t6 = pickTrial(wifi6, { excludeSeed });
    setRun({ wifi5, wifi6, trial5: t5, trial6: t6, seed: t5?.seed ?? null });
    setPhase('results');
  }

  return (
    <main className="shell">
      <h1 className="page-title">Lecture theatre WiFi simulator</h1>
      <p className="page-sub">
        WiFi 5 (802.11ac) against WiFi 6 (802.11ax), from NS-3 simulations.
      </p>

      {phase === 'setup' ? (
        <section className="card">
          <ConditionsPanel
            scenarios={scenarios}
            conditions={conditions}
            onChange={setConditions}
          />
          <button
            className="go-button"
            onClick={() => start(null)}
            disabled={!available}
          >
            GO
          </button>
          <p className="go-note">
            Replays a stored NS-3 trial — not a live measurement.
          </p>
          {!available && (
            <p className="unavailable">
              This combination has not been simulated yet.
            </p>
          )}
        </section>
      ) : (
        <section className="card">
          <p className="verdict">
            {buildVerdict({
              wifi5: run.wifi5,
              wifi6: run.wifi6,
              clients: conditions.clients,
              trafficType: conditions.trafficType,
            })}
          </p>
          <p>Gauges arrive in Task 5.</p>
          <button className="secondary-button" onClick={() => setPhase('setup')}>
            Change conditions
          </button>
        </section>
      )}

      <section className="explorer">
        <h2>Explore the full dataset</h2>
        <p className="page-sub">Every metric across every simulated density.</p>
        <label className="condition">
          <span className="condition-q">Metric</span>
          <select
            value={explorerMetricKey}
            onChange={(e) => setExplorerMetricKey(e.target.value)}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.plainLabel} — {m.label}
              </option>
            ))}
          </select>
        </label>
        <ComparisonChart
          scenarios={scenarios}
          topology={conditions.aps === 3 ? 'multi_ap' : 'single_ap'}
          trafficType={conditions.trafficType}
          metric={METRICS.find((m) => m.key === explorerMetricKey)}
        />
      </section>
    </main>
  );
}
