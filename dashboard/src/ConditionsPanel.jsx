import { TRAFFIC_LABELS } from './metrics';
import { availableConditions, isCombinationAvailable } from './scenarios';

/**
 * Every control is derived from the dataset. A value the simulation never
 * covered is shown disabled rather than offered and silently substituted.
 */
export default function ConditionsPanel({ scenarios, conditions, onChange }) {
  const options = availableConditions(scenarios);

  function set(patch) {
    onChange({ ...conditions, ...patch });
  }

  function optionUsable(patch) {
    return isCombinationAvailable(scenarios, { ...conditions, ...patch });
  }

  return (
    <div className="conditions">
      <label className="condition">
        <span className="condition-q">How many students are in the room?</span>
        <select
          value={conditions.clients}
          onChange={(e) => set({ clients: Number(e.target.value) })}
        >
          {options.clients.map((c) => (
            <option key={c} value={c} disabled={!optionUsable({ clients: c })}>
              {c} students{optionUsable({ clients: c }) ? '' : ' — not simulated'}
            </option>
          ))}
        </select>
      </label>

      <label className="condition">
        <span className="condition-q">What are they doing?</span>
        <select
          value={conditions.trafficType}
          onChange={(e) => set({ trafficType: e.target.value })}
        >
          {options.trafficTypes.map((t) => (
            <option key={t} value={t} disabled={!optionUsable({ trafficType: t })}>
              {TRAFFIC_LABELS[t] ?? t}
              {optionUsable({ trafficType: t }) ? '' : ' — not simulated'}
            </option>
          ))}
        </select>
      </label>

      <label className="condition">
        <span className="condition-q">How many access points?</span>
        <select
          value={conditions.aps}
          onChange={(e) => set({ aps: Number(e.target.value) })}
        >
          {options.apCounts.map((a) => (
            <option key={a} value={a} disabled={!optionUsable({ aps: a })}>
              {a === 1 ? '1 access point' : `${a} access points`}
              {optionUsable({ aps: a }) ? '' : ' — not simulated'}
            </option>
          ))}
        </select>
      </label>

      <details className="advanced">
        <summary>Advanced conditions</summary>
        <p className="go-note">
          Competing networks and room spread are not in the dataset yet. They
          appear here once those simulations have been run.
        </p>
      </details>
    </div>
  );
}
