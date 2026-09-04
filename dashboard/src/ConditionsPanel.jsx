import { memo } from 'react';
import { TRAFFIC_PLACARDS } from './metrics';
import { availableConditions, isCombinationAvailable } from './scenarios';
import { reachableConditions } from './matrix';

/**
 * The control strip.
 *
 * Positions are radio inputs underneath, so keyboard arrows, focus and screen
 * readers all behave natively; the instrument appearance sits on top of real
 * form semantics rather than replacing them.
 *
 * A position the simulation never ran is rendered unpowered and disabled — it
 * discloses that the study reaches there without ever offering a value that
 * would have to be invented, and it is never silently substituted.
 */

function Selector({ name, legend, positions, value, onSelect, format, isLive, dense }) {
  const deadCount = positions.filter((p) => !isLive(p)).length;

  return (
    <fieldset className="selector">
      {/* The note sits UNDER the control, not beside the legend. Inline, it
          wrapped "ACCESS POINTS" onto a second line and pushed that control
          out of alignment with the other two. */}
      <legend className="selector-legend">{legend}</legend>

      <div className={dense ? 'detents is-dense' : 'detents'}>
        {positions.map((p) => {
          const live = isLive(p);
          const selected = p === value;
          return (
            <label
              key={p}
              className={[
                'detent',
                selected ? 'is-selected' : '',
                live ? '' : 'is-dead',
              ].join(' ').trim()}
              title={live ? undefined : 'Not simulated yet'}
            >
              <input
                type="radio"
                name={name}
                value={String(p)}
                checked={selected}
                disabled={!live}
                onChange={() => onSelect(p)}
              />
              <span className="detent-tick" aria-hidden="true" />
              <span className="detent-label">{format(p)}</span>
            </label>
          );
        })}
      </div>

      {deadCount > 0 && (
        <p className="selector-note">{deadCount} not simulated</p>
      )}
    </fieldset>
  );
}

function ConditionsPanel({ scenarios, conditions, onChange }) {
  const available = availableConditions(scenarios);
  const reachable = reachableConditions(available);

  function set(patch) {
    onChange({ ...conditions, ...patch });
  }

  const usable = (patch) => isCombinationAvailable(scenarios, { ...conditions, ...patch });

  return (
    <div className="conditions">
      <Selector
        name="clients"
        legend="Students"
        positions={reachable.clients}
        value={conditions.clients}
        onSelect={(c) => set({ clients: c })}
        format={(c) => c}
        isLive={(c) => usable({ clients: c })}
        dense
      />

      <Selector
        name="traffic"
        legend="Activity"
        positions={reachable.trafficTypes}
        value={conditions.trafficType}
        onSelect={(t) => set({ trafficType: t })}
        format={(t) => TRAFFIC_PLACARDS[t] ?? t}
        isLive={(t) => usable({ trafficType: t })}
      />

      <Selector
        name="aps"
        legend="Access points"
        positions={reachable.apCounts}
        value={conditions.aps}
        onSelect={(a) => set({ aps: a })}
        format={(a) => `${a} AP`}
        isLive={(a) => usable({ aps: a })}
      />

      <details className="advanced">
        <summary>Advanced</summary>
        <p>
          Competing networks and room spread are planned conditions with no
          runs behind them yet. They appear as positions here once those
          simulations exist.
        </p>
      </details>
    </div>
  );
}

// Rescans every scenario in the dataset to decide which positions are live.
// Nothing it reads changes while a replay is running, so it should not be
// doing that work sixty times a second.
export default memo(ConditionsPanel);
