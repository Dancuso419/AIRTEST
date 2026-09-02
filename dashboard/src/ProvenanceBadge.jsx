/**
 * Required on every result view. The PRD's risk register names the failure
 * mode this prevents: a sampled run being mistaken for a live simulation.
 */
export default function ProvenanceBadge({ seed, trialIndex, trialCount, ns3Version }) {
  // Only claim a trial index when it's a real, positive position in a known
  // count — never surface "Trial 0 of 2" or "Trial 1 of 0". Seed, version and
  // "pre-computed" are shown regardless.
  const hasTrialInfo = Number.isInteger(trialIndex) && trialIndex > 0 && trialCount > 0;
  return (
    <p className="provenance">
      {hasTrialInfo && <>Trial {trialIndex} of {trialCount} · </>}
      seed {seed} · NS-3 {ns3Version} · <strong>pre-computed</strong>
    </p>
  );
}
