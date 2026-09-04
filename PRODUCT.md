# Product

**AIRTEST** — a WiFi capacity simulator for dense university lecture theatres.

## Platform

Static web. No backend, no database, no API. Deployed as static files
(Netlify or Vercel). Desktop-first: the real viewing scene is a laptop or a
projector, not a phone.

## Stack

Vite 8, React 19, Recharts 3. Node 24's built-in test runner. Data arrives as a
single bundled `results.json` produced offline by an NS-3 3.42 simulation
pipeline (C++ scenario, Python parser).

## Users

- **Primary: the FYP examiner / supervisor.** Technically literate, not a WiFi
  specialist. Sees this in a viva, on a projector, for a few minutes, while
  looking for reasons to doubt it.
- **Secondary: university IT / network planning staff.** Deciding whether an
  upgrade is worth funding. Wants the answer, not the methodology.

Neither audience knows what "Jain's fairness index" or "airtime utilisation"
mean without being told.

## Product Purpose

Answer one question in seconds: **what does a student in a full lecture theatre
actually get, on WiFi 5 versus WiFi 6?**

The unique mechanism: it replays real pre-computed NS-3 trials. Set the room
conditions, press GO, and watch both standards resolve side by side — including
the fact that two runs of the same scenario disagree, because randomness is part
of the finding.

## Positioning

An instrument, not a dashboard. It reports measurements taken elsewhere, with
their provenance and their limitations attached. Closer to test equipment than
to business analytics.

## Operating Context

Viewed in a lit room, frequently projected, at a distance, by someone who did
not build it. Legibility at range beats density. The session is short and the
scrutiny is high.

## Capabilities and Constraints

- **It cannot run a simulation.** Static site, no backend; and a single WiFi 6
  run at 20 clients takes ~12 minutes of CPU. Every result shown is a replay of
  a stored trial. The UI must state this permanently and unmissably — mistaking
  replayed data for live measurement is the project's named risk.
- **Every control must map to a parameter the simulation actually varied.** A
  control with no data behind it would require inventing a response. Fabricated
  data is unrecoverable in an FYP.
- Current dataset: single AP, video traffic, 10/14/20 students, 2 trials each,
  3-second measurement window. Browsing, downloading and multi-AP are specified
  but the scenario does not implement them yet.
- **Density grid capped at 60 students** (documented study constraint, not the
  TRD's original 20-200). WiFi 6 runs cost roughly 9x their WiFi 5 equivalents
  and hit a sharp cost knee between 16 and 20 clients; the full grid is days of
  compute the project does not have. Consequence the write-up must state: 60
  students offer ~180 Mbps against a measured ceiling near 346 Mbps, so the
  medium may never saturate inside the grid, and ">60" is not a saturation
  point.
- Metrics available: per-student throughput, aggregate throughput, latency,
  jitter, packet loss, offered-load satisfaction, Jain's fairness, airtime
  utilisation. Energy efficiency is **omitted** — TWT is absent from NS-3 3.42.

## Brand Commitments

- **Name: AIRTEST.** Set by the user.
- Reference material supplied by the user: `METER REF.png` (an instrument dial —
  arc, needle, pivot, tick scale) and `DASH REF.jpg` (a green palette).
- The user has rejected the first execution as reading like a generic template
  and asked for the craft level of a startup product.

## Evidence on Hand

Real simulation output, already committed:

- WiFi 6 delivers the same traffic in **consistently less airtime** than WiFi 5
  at every measured density (21.7% vs 26.4% at 10 students; 28.6% vs 39.0% at
  14). This is the study's actual finding.
- At these densities neither standard is stressed, so throughput barely differs
  — the honest verdict is "no meaningful difference at this density".
- Run-to-run variance is large: 6.67% packet loss on one seed against 0.064% on
  another, same scenario.
- `results.json` carries its own caveats: packet loss is inflated by the short
  measurement window and that inflation grows with density; latency and jitter
  cover delivered packets only.

## Product Principles

1. **Never imply live measurement.** No progress bar, no spinner, no timer. A
   count-up animates a value already known, and says so in the code.
2. **Never manufacture a contrast.** Where the two standards do not
   meaningfully differ, say so.
3. **Never offer a condition that was not simulated**, and never substitute the
   nearest scenario for a missing one.
4. **Show the caveats beside the numbers**, not in a footnote nobody opens.
5. **Plain language over jargon** — "speed per student", not "aggregate
   throughput".

## Accessibility & Inclusion

Read at projector distance by a mixed audience. The two standards must stay
distinguishable without relying on hue alone (value plus line style), body text
at 4.5:1 or better, keyboard-operable controls, and `prefers-reduced-motion`
honoured by landing on final values immediately.
