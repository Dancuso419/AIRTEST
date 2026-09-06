import { memo } from 'react';
import { buildEvaluation } from './evaluation';

/**
 * The plain-English readout of a finished run.
 *
 * The dials say what happened; this says what it means, for a reader who
 * does not know what airtime is and should not have to. Every line names a
 * winner, a draw, or nothing at all — there is no fourth option where a
 * difference gets implied without being stated.
 */

const CHIP = {
  wifi5: 'WiFi 5',
  wifi6: 'WiFi 6',
  tie: 'Level',
};

function EvaluationPanel({ wifi5, wifi6, clients, trafficType, aps }) {
  const ev = buildEvaluation({ wifi5, wifi6, clients, trafficType, aps });

  return (
    <div className="evaluation">
      <p className="eval-headline">{ev.headline}</p>
      {ev.bottomLine && <p className="eval-tally">{ev.bottomLine}</p>}

      {ev.rows.length > 0 && (
        <ul className="eval-list">
          {ev.rows.map((row) => (
            <li key={row.key} className={`eval-row is-${row.winner}`}>
              <span className={`eval-chip is-${row.winner}`}>{CHIP[row.winner]}</span>
              <span className="eval-metric">{row.label}</span>
              <span className="eval-sentence">
                {row.sentence}
                {/* The mechanism, where one honestly applies. A reader whose
                    expectation was "the newer one wins" needs to know why it
                    did not, or they will conclude the study is wrong. */}
                {row.reason && <span className="eval-why">{row.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {ev.note && <p className="eval-note">{ev.note}</p>}

      {/* Stated here as well as in the transport, because this block is the
          part a reader is most likely to screenshot on its own. */}
      <p className="eval-source">
        Read from stored NS-3 trials for these exact conditions. Averaged across
        every seed that was run — not a live measurement, and not a prediction.
      </p>
    </div>
  );
}

// Rebuilds eight comparisons and every sentence in them. It is inside a
// dialog that is usually closed, and its inputs cannot change mid-replay.
export default memo(EvaluationPanel);
