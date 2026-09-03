import { METRICS, STANDARD_LABELS } from './metrics';
import InstrumentDial from './InstrumentDial';
import { sampleAt } from './useReplay';

/**
 * The six-pack. Six instruments, each owning one truth, read as a fixed
 * sweep — throughput first, then the two failure modes, then the three
 * efficiency and quality measures.
 *
 * Jitter and total speed sit in the status strip instead: eight dials is a
 * wall, six is a scan.
 */
const SIX_PACK = [
  'per_user_throughput_mbps',
  'latency_ms',
  'packet_loss_pct',
  'airtime_utilization_pct',
  'satisfaction_ratio_pct',
  'fairness_index',
];

/**
 * Full-scale values. Deliberate, never derived from the data: a dial that
 * rescales itself per run destroys comparability between runs, which is the
 * whole point of an instrument.
 *
 * 5 Mbps per student comfortably covers HD video. 100 ms is twice the study's
 * 50 ms latency threshold, so the threshold sits mid-dial.
 */
const SCALE = {
  per_user_throughput_mbps: 5,
  latency_ms: 100,
  packet_loss_pct: 20,
  airtime_utilization_pct: 100,
  satisfaction_ratio_pct: 100,
  fairness_index: 1,
};

const FORMAT = {
  per_user_throughput_mbps: (v) => (v ?? 0).toFixed(1),
  latency_ms: (v) => (v ?? 0).toFixed(1),
  packet_loss_pct: (v) => (v ?? 0).toFixed(1),
  airtime_utilization_pct: (v) => Math.round(v ?? 0).toString(),
  satisfaction_ratio_pct: (v) => Math.round(v ?? 0).toString(),
  fairness_index: (v) => (v ?? 0).toFixed(2),
};

/**
 * `frame5`/`frame6` are a single sampled interval during replay. Metrics the
 * series does not carry (satisfaction, fairness) fall back to the trial's own
 * value — they are whole-run figures with no meaningful per-interval form,
 * and inventing one would be worse than holding steady.
 */
export default function ResultGauges({ trial5, trial6, frame5, frame6,
                                       series5, series6, position, playing }) {
  // Printed value: the sample the run actually recorded.
  const read = (trial, frame, key) =>
    (frame && frame[key] !== undefined ? frame[key] : trial?.[key]);

  // Needle: interpolated between two adjacent recorded samples so it sweeps
  // rather than steps. Falls back to the printed value when not replaying,
  // and for whole-run metrics the series does not carry.
  const point = (series, trial, frame, key) => {
    if (!playing) return read(trial, frame, key);
    const v = sampleAt(series, position, key);
    return typeof v === 'number' ? v : read(trial, frame, key);
  };

  return (
    <>
      <div className="needle-key">
        <span className="key-item">
          <span className="key-swatch" style={{ background: 'var(--wifi5)' }} />
          {STANDARD_LABELS.wifi5}
        </span>
        <span className="key-item">
          <span className="key-swatch" style={{ background: 'var(--wifi6)' }} />
          {STANDARD_LABELS.wifi6}
        </span>
      </div>

      <div className="cluster">
        {SIX_PACK.map((key) => (
          <InstrumentDial
            key={key}
            metric={METRICS.find((m) => m.key === key)}
            value5={read(trial5, frame5, key)}
            value6={read(trial6, frame6, key)}
            needle5={point(series5, trial5, frame5, key)}
            needle6={point(series6, trial6, frame6, key)}
            scaleMax={SCALE[key]}
            formatValue={FORMAT[key]}
          />
        ))}
      </div>
    </>
  );
}
