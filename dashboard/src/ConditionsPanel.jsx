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
        <span className="condition-q">Students in the room</span>
        <select
          value={conditions.clients}
          onChange={(e) => set({ clients: Number(e.target.value) })}
        >
          {options.clients.map((c) => (
            <option key={c} value={c} disabled={!optionUsable({ clients: c })}>
              {c} students{optionUsable({ clients: c }) ? '' : ' · NO DATA'}
            </option>
          ))}
        </select>
      </label>

      <label className="condition">
        <span className="condition-q">Activity</span>
        <select
          value={conditions.trafficType}
          onChange={(e) => set({ trafficType: e.target.value })}
        >
          {options.trafficTypes.map((t) => (
            <option key={t} value={t} disabled={!optionUsable({ trafficType: t })}>
              {TRAFFIC_LABELS[t] ?? t}
              {optionUsable({ trafficType: t }) ? '' : ' · NO DATA'}
            </option>
          ))}
        </select>
      </label>

      <label className="condition">
        <span className="condition-q">Access points</span>
        <select
          value={conditions.aps}
          onChange={(e) => set({ aps: Number(e.target.value) })}
        >
          {options.apCounts.map((a) => (
            <option key={a} value={a} disabled={!optionUsable({ aps: a })}>
              {a === 1 ? '1 access point' : `${a} access points`}
              {optionUsable({ aps: a }) ? '' : ' · NO DATA'}
            </option>
          ))}
        </select>
      </label>

      <details className="advanced">
        <summary>Advanced</summary>
        <p className="go-note">
          Competing networks and room spread are not in the dataset yet. They
          appear here once those simulations have been run.
        </p>
      </details>
    </div>
  );
}
