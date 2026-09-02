import { useCountUp } from './useCountUp';

/**
 * One instrument, one truth, two needles.
 *
 * The white needle is WiFi 5, the radium needle is WiFi 6, on a single shared
 * scale — so the gap between them IS the reading, rather than something the
 * viewer has to reconstruct by comparing two separate gauges.
 *
 * The tick scale is not decoration. Without a labelled scale a dial is a
 * progress ring, and the number it points at means nothing.
 */

const CX = 100;
const CY = 106;
const R = 74;
const TICK_LEN = 8;
const NEEDLE_LEN = 62;

// 240 degrees of sweep, the aviation convention: the dead zone at the bottom
// is where the needle parks, so "no data" is visibly different from "zero".
const START = 210;
const SWEEP = 240;

function polar(radius, fraction) {
  const deg = START - SWEEP * fraction;
  const rad = (deg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
}

function Needle({ fraction, color, width, glow, length = NEEDLE_LEN }) {
  const tip = polar(length, fraction);
  const tail = polar(-9, fraction);
  return (
    <line
      x1={tail.x}
      y1={tail.y}
      x2={tip.x}
      y2={tip.y}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      style={glow ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined}
    />
  );
}

export default function InstrumentDial({ metric, value5, value6, scaleMax, formatValue }) {
  const shown5 = useCountUp(value5 ?? 0);
  const shown6 = useCountUp(value6 ?? 0);

  const f5 = Math.max(0, Math.min((shown5 ?? 0) / scaleMax, 1));
  const f6 = Math.max(0, Math.min((shown6 ?? 0) / scaleMax, 1));

  const majors = [0, 0.5, 1];
  const minors = Array.from({ length: 21 }, (_, i) => i / 20);

  return (
    <div className="instrument">
      <div className="dial-face">
        <svg viewBox="0 0 200 200" role="img"
             aria-label={`${metric.plainLabel}. WiFi 5 ${formatValue(value5)}, WiFi 6 ${formatValue(value6)} ${metric.unit}`}>
          {minors.map((t) => {
            const a = polar(R, t);
            const b = polar(R - (majors.includes(t) ? TICK_LEN : TICK_LEN / 2), t);
            return (
              <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={majors.includes(t) ? '#f2f5f5' : '#4a5157'}
                    strokeWidth={majors.includes(t) ? 1.6 : 0.8} />
            );
          })}

          {majors.map((t) => {
            const p = polar(R - TICK_LEN - 9, t);
            // Lift the two end labels clear of the centre readout well.
            const dy = t === 0 || t === 1 ? -9 : 0;
            return (
              <text key={t} x={p.x} y={p.y + dy} fill="#8b969b"
                    fontSize="8.5" fontFamily="Saira Variable, sans-serif"
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(t * scaleMax)}
              </text>
            );
          })}

          {/* Different lengths so an exact tie still reads as two needles.
              Equal performance is a finding; a hidden needle would erase it. */}
          <Needle fraction={f5} color="#f2f5f5" width={2.4} length={NEEDLE_LEN} />
          <Needle fraction={f6} color="#7cff9e" width={2.4} length={NEEDLE_LEN - 14} glow />

          <circle cx={CX} cy={CY} r="7.5" fill="#14171a" stroke="#4a5157" strokeWidth="1.4" />
          <circle cx={CX} cy={CY} r="2" fill="#8b969b" />
        </svg>

        <div className="dial-readout">
          <div className="readout-pair">
            <span className="readout-5 num">{formatValue(value5)}</span>
            <span className="readout-sep">/</span>
            <span className="readout-6 num">{formatValue(value6)}</span>
          </div>
          <span className="readout-unit">{metric.unit}</span>
        </div>
      </div>

      <div className="instrument-placard">{metric.plainLabel}</div>
      <p className="instrument-sub">{metric.explanation}</p>
    </div>
  );
}
