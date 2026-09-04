import { useEffect, useMemo, useRef, useState } from 'react';
import results from './data/results.json';
import ComparisonChart from './ComparisonChart';
import ConditionsPanel from './ConditionsPanel';
import ResultGauges from './ResultGauges';
import ProvenanceBadge from './ProvenanceBadge';
import EvaluationPanel from './EvaluationPanel';
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
  // Whether the NEXT run should animate. The panel loads a real trial on
  // mount so it never opens as six dead instruments, but landing on final
  // values rather than performing unasked.
  const [shouldPlay, setShouldPlay] = useState(false);
  const [explorerMetricKey, setExplorerMetricKey] = useState('per_user_throughput_mbps');

  const available = isCombinationAvailable(scenarios, conditions);

  const replay = useReplay(run?.trial5?.series, run?.trial6?.series, shouldPlay);

  function start(excludeSeed = null, { play = true } = {}) {
    setShouldPlay(play);
    const wifi5 = findScenario(scenarios, { ...conditions, standard: 'wifi5' });
    const wifi6 = findScenario(scenarios, { ...conditions, standard: 'wifi6' });
    const t5 = pickTrial(wifi5, { excludeSeed });
    const t6 = pickTrial(wifi6, { excludeSeed });
    // useReplay starts itself when the new series lands in state. Calling
    // play() here read a frames count of 0, because the series had not
    // arrived yet, and the replay silently never ran.
    setRun({ wifi5, wifi6, trial5: t5, trial6: t6, seed: t5?.seed ?? null });
  }

  // Power-up: land on a real trial so the first viewport shows the
  // instrument working rather than an empty panel.
  useEffect(() => {
    if (available) start(null, { play: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trialIndex = run
    ? (run.wifi5?.trials?.findIndex((t) => t.seed === run.seed) ?? -1) + 1
    : 0;
  const trialCount = run?.wifi5?.trials?.length ?? 0;
  const replayable = replay.frames > 1;

  const metricIndex = METRICS.findIndex((m) => m.key === explorerMetricKey);
  const explorerMetric = METRICS[metricIndex];
  const swipeStart = useRef(null);

  // Wraps, so the set has no dead ends at either edge.
  const stepMetric = (delta) =>
    setExplorerMetricKey(
      METRICS[(metricIndex + delta + METRICS.length) % METRICS.length].key
    );

  // Stated, never assumed: the rate follows REPLAY_SECONDS, so stretching
  // playback can never leave a stale multiplier on screen claiming otherwise.
  const replayRate = (
    (results.meta.measurement_window_s ?? 3) / REPLAY_SECONDS
  ).toFixed(2).replace(/0$/, '');

  const reportRef = useRef(null);
  const openReport = () => reportRef.current?.showModal();
  const closeReport = () => reportRef.current?.close();

  /**
   * Ripple from the point of contact. The press has to feel like it landed
   * somewhere, so the circle starts where the finger or cursor actually was
   * rather than at the centre of the button.
   */
  function ripple(event) {
    if (typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host = event.currentTarget;
    const box = host.getBoundingClientRect();
    const size = Math.max(box.width, box.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${event.clientX - box.left - size / 2}px`;
    dot.style.top = `${event.clientY - box.top - size / 2}px`;
    // Removing on animationend rather than a timeout means a fast double
    // press leaves two circles running instead of cancelling the first. The
    // timeout is only a backstop: a background tab pauses CSS animations, so
    // animationend can be indefinitely deferred and the circle would still
    // be sitting on the button when the tab is looked at again.
    dot.addEventListener('animationend', () => dot.remove());
    setTimeout(() => dot.remove(), 1200);
    host.appendChild(dot);
  }

  const fmt = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');

  return (
    <main className="shell">
      <header className="masthead">
        <h1 className="wordmark">
          AIRTEST
          <span className="wordmark-sub">Lecture theatre WiFi instrument</span>
        </h1>
        <span className="masthead-meta">
          802.11ac / 802.11ax · NS-3 {results.meta.ns3_version ?? '3.42'}
        </span>
      </header>

      <section className="controls">
        <p className="section-label" data-index="01">Conditions</p>

        <div className="controls-row">
          <ConditionsPanel
            scenarios={scenarios}
            conditions={conditions}
            onChange={setConditions}
          />

          <div className="engage-bay">
            <button className="engage"
                    onClick={(e) => { ripple(e); start(null); }}
                    disabled={!available}>
              {run ? 'Replay' : 'Engage'}
            </button>
            <p className="provenance-note">
              Replays a stored NS-3 trial — not a live measurement.
            </p>
            {run && (
              <div className="actions">
                <button className="btn" onClick={() => start(run.seed)} disabled={trialCount < 2}>
                  New seed
                </button>
                <button className="btn" onClick={() => setRun(null)}>Clear</button>
              </div>
            )}
          </div>
        </div>

        {!available && (
          <p className="unavailable">This combination has not been simulated yet.</p>
        )}
      </section>

      <section className="readout-bay">
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
                  {replay.playing ? `Replaying · ${replayRate}×` : 'Run complete'}
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

            {/* The report is a conclusion, and a conclusion cannot be on
                screen while the run that produced it is still playing out.
                The button only exists once the needles have settled. */}
            <div className="report-cta">
              {replay.playing ? (
                <p className="report-wait">Reading the run…</p>
              ) : (
                <button className="report-open" onClick={openReport}>
                  View report
                </button>
              )}
            </div>

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

      <section className="explorer">
        <p className="section-label" data-index="03">Full dataset</p>

        {/* A dropdown hides seven of the eight metrics behind a click and gives
            no sense that they form a set. Stepping through them left to right
            makes the sweep itself visible, and the same gesture works with a
            thumb, a mouse and the arrow keys. */}
        <div
          className="stepper"
          tabIndex={0}
          role="group"
          aria-label="Metric"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); stepMetric(-1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); stepMetric(1); }
          }}
          onPointerDown={(e) => { swipeStart.current = e.clientX; }}
          onPointerUp={(e) => {
            const from = swipeStart.current;
            swipeStart.current = null;
            // 48px, so a slightly shaky click is never read as a swipe.
            if (from !== null && Math.abs(e.clientX - from) > 48) {
              stepMetric(e.clientX < from ? 1 : -1);
            }
          }}
        >
          <button className="step-arrow" onClick={() => stepMetric(-1)}
                  aria-label="Previous metric">‹</button>

          <div className="step-face">
            <p className="step-eyebrow">{explorerMetric.label}</p>
            <h3 className="step-title">{explorerMetric.plainLabel}</h3>
            <p className="step-sub">
              {explorerMetric.explanation} · {explorerMetric.unit} ·{' '}
              {explorerMetric.betterWhen === 'lower' ? 'lower is better' : 'higher is better'}
            </p>
          </div>

          <button className="step-arrow" onClick={() => stepMetric(1)}
                  aria-label="Next metric">›</button>
        </div>

        <div className="step-dots" role="tablist" aria-label="Metrics">
          {METRICS.map((m, i) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={i === metricIndex}
              aria-label={m.plainLabel}
              className={i === metricIndex ? 'step-dot is-on' : 'step-dot'}
              onClick={() => setExplorerMetricKey(m.key)}
            />
          ))}
        </div>

        <div className="chart-frame">
          <ComparisonChart
            scenarios={scenarios}
            topology={conditions.aps === 3 ? 'multi_ap' : 'single_ap'}
            trafficType={conditions.trafficType}
            metric={explorerMetric}
          />
        </div>

        <p className="step-hint">
          Swipe, click the arrows, or use ← → to move through all {METRICS.length}{' '}
          metrics. Every one is drawn across every simulated density.
        </p>
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
          {results.meta.ns3_version ?? '?'} · AIRTEST
        </p>
      </section>
      {/* A native dialog, so the backdrop, Escape, focus trapping and
          inertness of the page behind it are the platform's job, not
          three hundred lines of ours. */}
      <dialog
        className="report"
        ref={reportRef}
        onClick={(e) => { if (e.target === reportRef.current) closeReport(); }}
      >
        {run && (
          <div className="report-card">
            <div className="report-head">
              <p className="report-eyebrow">Evaluation · stored NS-3 trials</p>
              <button className="report-close" onClick={closeReport} aria-label="Close report">
                ×
              </button>
            </div>

            <EvaluationPanel
              wifi5={run.wifi5}
              wifi6={run.wifi6}
              clients={conditions.clients}
              trafficType={conditions.trafficType}
              aps={conditions.aps}
            />
          </div>
        )}
      </dialog>
    </main>
  );
}
