import { useMemo, useState } from 'react';
import results from './data/results.json';
import ComparisonChart from './ComparisonChart';
import ConditionsPanel from './ConditionsPanel';
import ResultGauges from './ResultGauges';
import ProvenanceBadge from './ProvenanceBadge';
import { METRICS, STANDARD_LABELS } from './metrics';
import { availableConditions, findScenario, isCombinationAvailable, pickTrial } from './scenarios';
import { buildVerdict } from './verdict';
import { useReplay, REPLAY_SECONDS } from './useReplay';

function StatusCell({ label, value, accent }) {
  return (
    <div className="status-cell">
      <dt>{label}</dt>
      <dd className={accent ? 'is-green num' : 'num'}>{value}</dd>
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
  const [explorerMetricKey, setExplorerMetricKey] = useState('per_user_throughput_mbps');

  const available = isCombinationAvailable(scenarios, conditions);

  const replay = useReplay(run?.trial5?.series, run?.trial6?.series);

  function start(excludeSeed = null) {
    const wifi5 = findScenario(scenarios, { ...conditions, standard: 'wifi5' });
    const wifi6 = findScenario(scenarios, { ...conditions, standard: 'wifi6' });
    const t5 = pickTrial(wifi5, { excludeSeed });
    const t6 = pickTrial(wifi6, { excludeSeed });
    // useReplay starts itself when the new series lands in state. Calling
    // play() here read a frames count of 0, because the series had not
    // arrived yet, and the replay silently never ran.
    setRun({ wifi5, wifi6, trial5: t5, trial6: t6, seed: t5?.seed ?? null });
  }

  const trialIndex = run
    ? (run.wifi5?.trials?.findIndex((t) => t.seed === run.seed) ?? -1) + 1
    : 0;
  const trialCount = run?.wifi5?.trials?.length ?? 0;
  const replayable = replay.frames > 1;

  const fmt = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');

  return (
    <main className="shell">
      <header className="masthead">
        <h1 className="wordmark">
          AIREST
          <span className="wordmark-sub">Lecture theatre WiFi instrument</span>
        </h1>
        <span className="masthead-meta">
          802.11ac / 802.11ax · NS-3 {results.meta.ns3_version ?? '3.42'}
        </span>
      </header>

      <div className="bay">
        <section>
          <p className="section-label" data-index="01">Conditions</p>

          <ConditionsPanel
            scenarios={scenarios}
            conditions={conditions}
            onChange={setConditions}
          />

          <button className="engage" onClick={() => start(null)} disabled={!available}>
            {run ? 'Replay' : 'Engage'}
          </button>

          <p className="provenance-note">
            Replays a stored NS-3 trial — not a live measurement.
          </p>

          {!available && (
            <p className="unavailable">This combination has not been simulated yet.</p>
          )}

          {run && (
            <div className="actions">
              <button className="btn" onClick={() => start(run.seed)} disabled={trialCount < 2}>
                New seed
              </button>
              <button className="btn" onClick={() => setRun(null)}>Clear</button>
            </div>
          )}
        </section>

        <section>
          <p className="section-label" data-index="02">Instrument cluster</p>

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

              {replayable && (
                <div className="transport">
                  <span className={replay.playing ? 'transport-state is-playing' : 'transport-state'}>
                    {replay.playing ? 'Replaying · 0.3×' : 'Run complete'}
                  </span>
                  <div className="scrub">
                    <div className="scrub-fill" style={{ width: `${replay.progress * 100}%` }} />
                  </div>
                  <span className="transport-clock num">
                    t+{fmt(replay.simSeconds ?? 0, 1)}s sim
                  </span>
                  <button
                    className="btn"
                    onClick={() => (replay.playing ? replay.stop() : replay.play())}
                  >
                    {replay.playing ? 'Stop' : 'Replay'}
                  </button>
                </div>
              )}

              <ResultGauges
                trial5={run.trial5}
                trial6={run.trial6}
                frame5={replay.playing ? replay.frame5 : null}
                frame6={replay.playing ? replay.frame6 : null}
                series5={run.trial5?.series}
                series6={run.trial6?.series}
                position={replay.position}
                playing={replay.playing}
              />

              <dl className="status-row">
                <StatusCell label={`Total speed · ${STANDARD_LABELS.wifi5}`}
                            value={`${fmt(run.trial5?.aggregate_throughput_mbps)} Mbps`} />
                <StatusCell label={`Total speed · ${STANDARD_LABELS.wifi6}`}
                            value={`${fmt(run.trial6?.aggregate_throughput_mbps)} Mbps`} accent />
                <StatusCell label={`Jitter · ${STANDARD_LABELS.wifi5}`}
                            value={`${fmt(run.trial5?.jitter_ms, 2)} ms`} />
                <StatusCell label={`Jitter · ${STANDARD_LABELS.wifi6}`}
                            value={`${fmt(run.trial6?.jitter_ms, 2)} ms`} accent />
              </dl>

              <ProvenanceBadge
                seed={run.seed}
                trialIndex={trialIndex}
                trialCount={trialCount}
                ns3Version={results.meta.ns3_version ?? '3.42'}
              />
              {replayable && (
                <p className="provenance-note">
                  Replay covers {fmt(results.meta.measurement_window_s ?? 3, 0)}s of simulated
                  time across {REPLAY_SECONDS}s of playback, from {replay.frames} recorded
                  samples. Slower than the run, never faster.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="verdict">
                Set the room, then engage. Six instruments read one stored trial —
                the ink needle is {STANDARD_LABELS.wifi5}, the teal needle is{' '}
                {STANDARD_LABELS.wifi6}. Where they separate is the finding.
              </p>
              <ResultGauges trial5={null} trial6={null} frame5={null} frame6={null}
                            series5={null} series6={null} position={0} playing={false} />
            </>
          )}
        </section>
      </div>

      {(results.meta.caveats ?? []).length > 0 && (
        <section className="caution">
          <p className="caution-head">Caution · dataset limitations</p>
          <ul>
            {results.meta.caveats.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>
      )}

      <section className="explorer">
        <div className="explorer-head">
          <div>
            <p className="section-label" data-index="03">Full dataset</p>
            <p style={{ margin: 0, color: 'var(--ink-dim)', fontSize: '0.78rem' }}>
              Every metric across every simulated density.
            </p>
          </div>
          <label>
            <select value={explorerMetricKey}
                    onChange={(e) => setExplorerMetricKey(e.target.value)}>
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>{m.plainLabel} — {m.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="chart-frame">
          <ComparisonChart
            scenarios={scenarios}
            topology={conditions.aps === 3 ? 'multi_ap' : 'single_ap'}
            trafficType={conditions.trafficType}
            metric={METRICS.find((m) => m.key === explorerMetricKey)}
          />
        </div>
      </section>

      <section className="explorer">
        <p className="section-label" data-index="04">What these numbers mean</p>
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
