/**
 * Required on every result view. The PRD's risk register names the failure
 * mode this prevents: a sampled run being mistaken for a live simulation.
 */
export default function ProvenanceBadge({ seed, trialIndex, trialCount, ns3Version }) {
  return (
    <p className="provenance">
      Trial {trialIndex} of {trialCount} · seed {seed} · NS-3 {ns3Version} ·{' '}
      <strong>pre-computed</strong>
    </p>
  );
}
