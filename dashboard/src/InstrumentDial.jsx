/**
 * One instrument, one truth, two needles.
 *
 * Drawn as a technical plate: hairline arc, hairline ticks, thin ink needles.
 * No bezel, no glow, no simulated material — this world draws instruments, it
 * does not photograph them.
 *
 * Both standards share one scale, so the gap between the needles IS the
 * reading rather than something the viewer reconstructs from two gauges.
 */

const CX = 100;
const CY = 108;
const R = 70;
const NEEDLE_LEN = 62;
// Scale labels sit OUTSIDE the arc, as on both reference dials. Inside, the
// needle swept straight across them.
const LABEL_R = R + 12;

// 200 degrees, opening downward. The gap at the bottom is where a needle
// parks, so "no data" is visibly different from "zero".
const START = 190;
const SWEEP = 200;

function polar(radius, fraction) {
  const deg = START - SWEEP * fraction;
  const rad = (deg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
}

function arcPath(radius) {
  const a = polar(radius, 0);
  const b = polar(radius, 1);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 1 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function Needle({ fraction, color, length, width }) {
  const tip = polar(length, fraction);
  const tail = polar(-7, fraction);
  return (
    <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y}
          stroke={color} strokeWidth={width} strokeLinecap="round" />
  );
}

export default function InstrumentDial({ metric, value5, value6, needle5, needle6,
                                         scaleMax, formatValue, divisions = 4,
                                         formatTick }) {
  // Needle position may be interpolated; the printed value never is.
  const n5 = needle5 ?? value5;
  const n6 = needle6 ?? value6;
  const f5 = Math.max(0, Math.min((n5 ?? 0) / scaleMax, 1));
  const f6 = Math.max(0, Math.min((n6 ?? 0) / scaleMax, 1));

  // Divisions are chosen per metric so every labelled tick is a clean number:
  // 5 Mbps reads 0..5 in whole steps rather than 1.25 / 3.75.
  const majors = Array.from({ length: divisions + 1 }, (_, i) => i / divisions);
  const mids = Array.from({ length: divisions }, (_, i) => (i + 0.5) / divisions);
  const minorCount = divisions * 10;
  const minors = Array.from({ length: minorCount + 1 }, (_, i) => i / minorCount);
  const label = formatTick ?? formatValue;

  // Card, not tile: each instrument turns on hover or keyboard focus to show
  // what it measures. tabIndex makes the back reachable without a pointer —
  // hover-only would hide the explanation from keyboard and touch entirely.
  return (
    <div className="instrument" tabIndex={0}>
     <div className="flip-inner">
      <div className="flip-face flip-front">
      <div className="dial-face">
        <svg viewBox="0 0 200 152" role="img"
             aria-label={`${metric.plainLabel}. WiFi 5 ${formatValue(value5)}, WiFi 6 ${formatValue(value6)} ${metric.unit}`}>
          <path d={arcPath(R)} fill="none" stroke="#cfc8b9" strokeWidth="1" />

          {minors.map((t) => {
            const major = majors.includes(t);
            const a = polar(R, t);
            const b = polar(R - (major ? 9 : 4.5), t);
            return (
              <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={major ? '#16181d' : '#cfc8b9'}
                    strokeWidth={major ? 1.3 : 0.8} />
            );
          })}

          {majors.map((t) => {
            const p = polar(R - 20, t);
            return (
              <text key={t} x={p.x} y={p.y} fill="#8b867c" fontSize="9"
                    fontFamily="Archivo Variable, sans-serif"
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                {label(t * scaleMax)}
              </text>
            );
          })}

          {/* Different lengths so an exact tie still reads as two needles.
              Equal performance is a finding; a hidden needle would erase it. */}
          <Needle fraction={f5} color="#16181d" length={NEEDLE_LEN} width={1.9} />
          <Needle fraction={f6} color="#0d8f6f" length={NEEDLE_LEN - 13} width={2.4} />

          <circle cx={CX} cy={CY} r="3.6" fill="#faf8f4" stroke="#16181d" strokeWidth="1.2" />
        </svg>
      </div>

      {/* Value sits below the figure as a plate caption, never inside the arc:
          overlaying it collided with the end tick labels at both scales. */}
      <div className="dial-readout">
        <div className="readout-pair">
          <span className="readout-5 num">{formatValue(value5)}</span>
          <span className="readout-sep">/</span>
          <span className="readout-6 num">{formatValue(value6)}</span>
        </div>
        <span className="readout-unit">{metric.unit}</span>
      </div>

      <div className="instrument-placard">{metric.plainLabel}</div>
      <p className="instrument-sub">{metric.explanation}</p>
      </div>

      <div className="flip-face flip-back">
        <p className="back-eyebrow">{metric.label}</p>
        <h3 className="back-title">{metric.plainLabel}</h3>
        <p className="back-body">{metric.detail ?? metric.explanation}</p>
        <dl className="back-facts">
          <div><dt>Full scale</dt><dd>{formatValue(scaleMax)} {metric.unit}</dd></div>
          <div><dt>Better</dt><dd>{metric.betterWhen === 'lower' ? 'Lower' : 'Higher'}</dd></div>
        </dl>
      </div>
     </div>
    </div>
  );
}
