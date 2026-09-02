import { METRICS, STANDARD_LABELS } from './metrics';
import { useCountUp } from './useCountUp';

const HEADLINE = METRICS.find((m) => m.headline);
const SUPPORTING = ['latency_ms', 'packet_loss_pct', 'airtime_utilization_pct'];

// Per-student speed at which the dial reads full. 5 Mbps comfortably covers HD
// video, so the sweep means something rather than being an arbitrary ceiling.
const FULL_SCALE_MBPS = 5;

const CX = 100;
const CY = 100;
const R = 72;
const NEEDLE_LEN = 58;
const SWEEP = Math.PI * R;

// Ticks give the dial a frame of reference. Per DESIGN.md section 3 they are
// what make this read as an instrument rather than a progress ring.
const TICKS = [0, 0.25, 0.5, 0.75, 1];

// Clean tick numbers: 0, 1.25, 2.5, 3.75, 5 — trailing zeros stripped
// consistently rather than only when a value rounds to whole hundredths.
function formatTick(n) {
  return parseFloat(n.toFixed(2)).toString();
}

function polar(radius, fraction) {
  const angle = Math.PI * (1 - fraction); // 180deg at 0, 0deg at full
  return {
    x: CX + radius * Math.cos(angle),
    y: CY - radius * Math.sin(angle),
  };
}

function Dial({ value, gradientId, deep }) {
  const fraction = Math.max(0, Math.min(value / FULL_SCALE_MBPS, 1));
  const tip = polar(NEEDLE_LEN, fraction);
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <svg viewBox="0 0 200 128" className="gauge-dial" role="presentation">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--mint)" />
          <stop offset="100%" stopColor={deep} />
        </linearGradient>
      </defs>

      <path d={arc} fill="none" stroke="var(--mint-pale)" strokeWidth="16" strokeLinecap="round" />
      <path
        d={arc}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={`${SWEEP * fraction} ${SWEEP}`}
      />

      {TICKS.map((t) => {
        const p = polar(R + 15, t);
        return (
          <text
            key={t}
            x={p.x}
            y={p.y}
            className="gauge-tick num"
            textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
          >
            {formatTick(t * FULL_SCALE_MBPS)}
          </text>
        );
      })}

      <line
        x1={CX}
        y1={CY}
        x2={tip.x}
        y2={tip.y}
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r="7" fill="var(--surface)" stroke="var(--ink)" strokeWidth="3" />
    </svg>
  );
}

function Gauge({ standard, trial }) {
  const raw = trial?.[HEADLINE.key] ?? 0;
  const shown = useCountUp(raw);
  const deep = standard === 'wifi5' ? 'var(--green)' : 'var(--forest)';

  return (
    <div className="gauge">
      <h3 className="gauge-title" style={{ color: deep }}>
        {STANDARD_LABELS[standard]}
      </h3>
      <Dial value={shown} gradientId={`grad-${standard}`} deep={deep} />
      <p className="gauge-value num">
        {shown.toFixed(1)}<span className="gauge-unit"> {HEADLINE.unit}</span>
      </p>
      <p className="gauge-label">
        {HEADLINE.plainLabel} — {HEADLINE.explanation}
      </p>

      <dl className="tiles">
        {SUPPORTING.map((key) => {
          const m = METRICS.find((x) => x.key === key);
          const v = trial?.[key];
          return (
            <div className="tile" key={key}>
              <dt>{m.plainLabel}</dt>
              <dd>
                {typeof v === 'number' ? v.toFixed(v < 10 ? 2 : 1) : '—'} {m.unit}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default function ResultGauges({ trial5, trial6 }) {
  return (
    <div className="gauges">
      <Gauge standard="wifi5" trial={trial5} />
      <Gauge standard="wifi6" trial={trial6} />
    </div>
  );
}
