import { METRICS, STANDARD_LABELS } from './metrics';
import InstrumentDial from './InstrumentDial';

/**
 * The six-pack. Six instruments, each owning one truth, read as a fixed
 * cross-check sweep — throughput first, then the two failure modes, then the
 * three efficiency and quality measures.
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
 * Each dial's full-scale value. These are deliberate, not derived from the
 * data: a scale that rescales itself per run destroys comparability between
 * runs, which is the whole point of the instrument.
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

export default function ResultGauges({ trial5, trial6 }) {
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
        {SIX_PACK.map((key) => {
          const metric = METRICS.find((m) => m.key === key);
          return (
            <InstrumentDial
              key={key}
              metric={metric}
              value5={trial5?.[key]}
              value6={trial6?.[key]}
              scaleMax={SCALE[key]}
              formatValue={FORMAT[key]}
            />
          );
        })}
      </div>
    </>
  );
}
