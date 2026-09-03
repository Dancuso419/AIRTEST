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
const CY = 104;
const R = 76;
const NEEDLE_LEN = 66;

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

export default function InstrumentDial({ metric, value5, value6, scaleMax, formatValue }) {
  const f5 = Math.max(0, Math.min((value5 ?? 0) / scaleMax, 1));
  const f6 = Math.max(0, Math.min((value6 ?? 0) / scaleMax, 1));

  const majors = [0, 0.5, 1];
  const minors = Array.from({ length: 21 }, (_, i) => i / 20);

  return (
    <div className="instrument">
      <div className="dial-face">
        <svg viewBox="0 0 200 156" role="img"
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
                {formatValue(t * scaleMax)}
              </text>
            );
          })}

          {/* Different lengths so an exact tie still reads as two needles.
              Equal performance is a finding; a hidden needle would erase it. */}
          <Needle fraction={f5} color="#16181d" length={NEEDLE_LEN} width={1.9} />
          <Needle fraction={f6} color="#1b3fa0" length={NEEDLE_LEN - 13} width={2.4} />

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
  );
}
