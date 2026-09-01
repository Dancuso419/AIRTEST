This document is a template to be completed by whoever runs
`sim/setup-ns3.sh` and carries out the verification steps (Steps 2-4 of the
Task 1 brief). Every slot below is a recording slot for observed output, not
a prediction — leave it unfilled until the build and checks have actually
been run. In particular, the energy-efficiency metric decision (PRD metric
9) depends on the TWT answer recorded in the "TWT (Target Wake Time)"
section below: if TWT is unsupported, that metric is omitted and documented
as a limitation, never approximated or fabricated.

# Phase 0 Verification

**NS-3 version:** 3.42 (release tarball)
**Build location:** `~/wifi-sim/ns-3.42` (WSL2 Ubuntu, ext4)
**Build date:** <fill in the date you ran it>

## Module availability

- 802.11ac (VHT): PRESENT / ABSENT — <paste the grep count>
- 802.11ax (HE): PRESENT / ABSENT — <paste the grep count>
- `wifi-he-network` example runs: YES / NO

## TWT (Target Wake Time)

- Implemented in mainline: YES / NO
- Evidence: <paste the grep output, or "no matches">

**Consequence:** If NO, the energy efficiency metric (PRD metric 9) is
omitted from `results.json` and recorded as a limitation in the methodology
chapter. It is not approximated or fabricated.
