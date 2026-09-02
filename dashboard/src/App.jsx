import { useMemo, useState } from 'react';
import results from './data/results.json';
import ComparisonChart from './ComparisonChart';
import ConditionsPanel from './ConditionsPanel';
import ResultGauges from './ResultGauges';
import ProvenanceBadge from './ProvenanceBadge';
import { METRICS, STANDARD_LABELS } from './metrics';
import { availableConditions, findScenario, isCombinationAvailable, pickTrial } from './scenarios';
import { buildVerdict } from './verdict';

function StatusCell({ label, value, green }) {
  return (
    <div className="status-cell">
      <dt>{label}</dt>
      <dd className={green ? 'is-green num' : 'num'}>{value}</dd>
    </div>
  );
}

export default function App() {
  const scenarios = results.scenarios;
  const options = useMemo(() => availableConditions(scenarios), [scenarios]);

  const [conditions, setConditions] = useState({
    clients: options.clients[0],
    trafficType: options.trafficTypes[0],
    aps: options.apCounts[0],
  });
  const [run, setRun] = useState(null);
  // The explorer keeps its own metric selection, independent of the panel's
  // conditions — it is the technical view, not the plain one.
  const [explorerMetricKey, setExplorerMetricKey] = useState('per_user_throughput_mbps');

  const available = isCombinationAvailable(scenarios, conditions);

  function start(excludeSeed = null) {
    const wifi5 = findScenario(scenarios, { ...conditions, standard: 'wifi5' });
    const wifi6 = findScenario(scenarios, { ...conditions, standard: 'wifi6' });
    const t5 = pickTrial(wifi5, { excludeSeed });
    const t6 = pickTrial(wifi6, { excludeSeed });
    setRun({ wifi5, wifi6, trial5: t5, trial6: t6, seed: t5?.seed ?? null });
  }

  const trialIndex = run
    ? (run.wifi5?.trials?.findIndex((t) => t.seed === run.seed) ?? -1) + 1
    : 0;
  const trialCount = run?.wifi5?.trials?.length ?? 0;

  const fmt = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');

  return (
    <main className="shell">
      <header className="masthead">
        <h1 className="wordmark">
          AIREST
          <span className="wordmark-sub">Lecture Theatre WiFi Instrument</span>
        </h1>
        <span className="masthead-meta">
          802.11ac / 802.11ax · NS-3 {results.meta.ns3_version ?? '3.42'}
        </span>
      </header>

      <div className="bay">
        <section className="panel">
          <p className="section-label">01 · Conditions</p>

          <ConditionsPanel
            scenarios={scenarios}
            conditions={conditions}
            onChange={setConditions}
          />

          <button className="engage" onClick={() => start(null)} disabled={!available}>
            <span className="engage-dot" />
            {run ? 'Re-engage' : 'Engage'}
          </button>

          <p className="provenance-note">
            Replays a stored NS-3 trial — not a live measurement.
          </p>

          {!available && (
            <p className="unavailable">
              This combination has not been simulated yet.
            </p>
          )}

          {run && (
            <div className="actions">
              <button
                className="btn"
                onClick={() => start(run.seed)}
                disabled={trialCount < 2}
              >
                New seed
              </button>
              <button className="btn" onClick={() => setRun(null)}>
                Clear
              </button>
            </div>
          )}
        </section>

        <section className="panel panel-screws-bottom">
          <p className="section-label">02 · Instrument cluster</p>

          {run ? (
            <>
              <p className="verdict">
                {buildVerdict({
                  wifi5: run.wifi5,
                  wifi6: run.wifi6,
                  clients: conditions.clients,
                  trafficType: conditions.trafficType,
                })}
              </p>

              <ResultGauges trial5={run.trial5} trial6={run.trial6} />

              <dl className="status-row">
                <StatusCell
                  label="Total speed · WiFi 5"
                  value={`${fmt(run.trial5?.aggregate_throughput_mbps)} Mbps`}
                />
                <StatusCell
                  label="Total speed · WiFi 6"
                  value={`${fmt(run.trial6?.aggregate_throughput_mbps)} Mbps`}
                  green
                />
                <StatusCell
                  label="Jitter · WiFi 5"
                  value={`${fmt(run.trial5?.jitter_ms, 2)} ms`}
                />
                <StatusCell
                  label="Jitter · WiFi 6"
                  value={`${fmt(run.trial6?.jitter_ms, 2)} ms`}
                  green
                />
              </dl>

              <ProvenanceBadge
                seed={run.seed}
                trialIndex={trialIndex}
                trialCount={trialCount}
                ns3Version={results.meta.ns3_version ?? '3.42'}
              />
            </>
          ) : (
            <>
              <p className="verdict">
                Set the room conditions, then engage. Six instruments read the
                same stored trial — the white needle is{' '}
                {STANDARD_LABELS.wifi5}, the green needle is{' '}
                {STANDARD_LABELS.wifi6}. Where they separate is the finding.
              </p>
              <ResultGauges trial5={null} trial6={null} />
            </>
          )}
        </section>
      </div>

      {(results.meta.caveats ?? []).length > 0 && (
        <section className="caution">
          <p className="caution-head">
            <span className="engage-dot" style={{ borderColor: 'var(--amber)', background: 'var(--amber)' }} />
            Caution · dataset limitations
          </p>
          <ul>
            {results.meta.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="explorer">
        <div className="explorer-head">
          <div>
            <p className="section-label">03 · Full dataset</p>
            <p style={{ margin: 0, color: 'var(--lum-dim)', fontSize: '0.78rem' }}>
              Every metric across every simulated density.
            </p>
          </div>
          <label>
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
        </div>

        <div className="panel">
          <ComparisonChart
            scenarios={scenarios}
            topology={conditions.aps === 3 ? 'multi_ap' : 'single_ap'}
            trafficType={conditions.trafficType}
            metric={METRICS.find((m) => m.key === explorerMetricKey)}
          />
        </div>
      </section>

      <section className="explorer">
        <p className="section-label">04 · What these numbers mean</p>
        <dl className="legend">
          {METRICS.map((m) => (
            <div key={m.key}>
              <dt>{m.plainLabel}</dt>
              <dd>{m.explanation} ({m.unit})</dd>
            </div>
          ))}
        </dl>

        <p className="footer-stamp">
          Generated {results.meta.generated_utc ?? 'unknown'} · measurement window{' '}
          {results.meta.measurement_window_s ?? '?'} s · NS-3{' '}
          {results.meta.ns3_version ?? '?'} · AIREST
        </p>
      </section>
    </main>
  );
}
