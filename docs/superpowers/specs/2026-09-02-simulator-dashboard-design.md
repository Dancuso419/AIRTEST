# Design Spec: Simulator-Style Dashboard

Date: 2026-09-02
Status: Approved
Supersedes the dashboard portion of `2026-09-01-wifi5-vs-wifi6-design.md` section 5.4
Source documents: `PRD.md`, `TRD.md`

---

## 1. Purpose

Replace the current single-chart dashboard with a simulator-style interface a
non-specialist can read, and implement the **Sample Run** interaction the PRD
lists as a must-have and the vertical slice deferred.

Two problems drive this:

1. **The current UI is unreadable to a non-technical audience.** It presents raw
   metric names — "aggregate throughput", "Jain's fairness index", "airtime
   utilization" — with no interpretation. A university IT manager deciding
   whether to fund an upgrade cannot act on it.
2. **There is no way to run anything.** The PRD specifies a Sample Run
   interaction that replays a pre-computed trial; only the comparison chart was
   built. A viewer reasonably expects a simulator to simulate something.

The reference model is speedtest.net: set conditions, press GO, read large
plain-language results. This spec adapts that interaction to a two-standard
comparison over pre-computed data.

## 2. The honesty constraint

This is the spec's binding requirement, and it overrides visual fidelity to the
reference model.

The dashboard **cannot** run a simulation. It is a static site with no backend
(PRD section 4, TRD section 8), and a single WiFi 6 run at 20 clients takes
about 12 minutes — hours at realistic densities. Every result shown is a replay
of a stored NS-3 trial.

The PRD's risk register names the failure mode directly: *"Sampled-run display
could be mistaken for live simulation."* Therefore:

- A permanent line beneath the GO button reads: **"Replays a stored NS-3 trial —
  not a live measurement."** It is not hidden behind a tooltip, an info icon, or
  a hover state.
- Every result view carries a provenance badge naming the trial, the seed, the
  NS-3 version, and the word *pre-computed*.
- **No fake progress bar.** A counting-up animation on result numbers is
  presentation and is permitted. A progress indicator that implies measurement
  is elapsing is deception and is forbidden. This distinction is not stylistic.

A reviewer must be able to look at any screen and tell within seconds that the
numbers were computed earlier.

## 3. Conditions: what the user may set

**Every control must map to a parameter the simulation actually varied.** A
control whose value the matrix does not cover would require inventing a
response, and fabricated data in an FYP is unrecoverable. This rule admits no
exceptions for visual completeness.

### Primary conditions (fully crossed in the matrix)

| Parameter | Control label | Values |
|---|---|---|
| `clients` | How many students are in the room? | 20-200 |
| `traffic_type` | What are they doing? | Browsing / Streaming video / Downloading |
| `aps` | How many access points? | 1 or 3 |

### Advanced conditions (optional, collapsed by default)

| Parameter | Control label | Values |
|---|---|---|
| `interference` | Competing WiFi nearby? | Off / On |
| `room_depth_m` | How spread out is the room? | Compact / Spread |

Advanced conditions default to off, and selecting one restricts the other
controls to the densities that sub-study actually covers. Controls for
combinations with no data are shown as unavailable, never silently substituted
with the nearest scenario.

### Experimental design for the advanced conditions

Approach chosen: **full factorial on the primary conditions, one-factor-at-a-time
for the advanced ones.**

Fully crossing all five parameters would take the 528-run core matrix to roughly
2,112 runs — weeks of compute on this hardware, and infeasible. Instead each
advanced condition is a focused sub-study at representative densities only:

- Interference: 3 densities x 2 standards x video only x 5 trials x 2 levels = **60 runs**
- Room depth: same shape = **60 runs**

**+120 runs rather than +1,584.** Full factorial on primary factors with OFAT
for secondary factors is standard experimental design and is defensible as such.
The report must state that interaction effects between the advanced conditions
and traffic type are consequently not measured.

### Room depth is a correction, not only a feature

The current scenario fixes `GridWidth = 10` with 1.2 m row pitch, so 20 students
occupy 2.4 m of depth and 200 students occupy 24 m. Mean AP-to-station distance,
and therefore path loss, currently grows with density — the density sweep varies
contention and distance together and cannot separate them. A prior review flagged
this as a threat to validity.

Making room depth an explicit parameter lets the study hold geometry constant
while density varies. This repairs a real confound; it is not merely an added
dial.

## 4. Interface

### Two states

**Setup.** Three primary questions in plain language, a collapsed advanced
panel, and a single prominent GO control with its provenance line.

**Results.** Two gauges side by side — WiFi 5 and WiFi 6 — for the selected
conditions, with the verdict sentence above and supporting metrics below.

### Metric vocabulary

Raw metric keys are unchanged in `results.json`; only presentation changes.

| Key | Displayed as | One-line explanation |
|---|---|---|
| `per_user_throughput_mbps` | Speed per student | what one person actually gets |
| `aggregate_throughput_mbps` | Total speed | the whole room combined |
| `latency_ms` | Lag | delay before things respond |
| `jitter_ms` | Jitter | how much the delay varies |
| `packet_loss_pct` | Data lost | what never arrived |
| `satisfaction_ratio_pct` | Demand met | share of what was asked for |
| `fairness_index` | Fairness | does everyone get an equal share |
| `airtime_utilization_pct` | Airwave usage | how congested the channel is |

**Speed per student is the headline figure.** "Each student gets 1.7 Mbps" is
immediately meaningful; "aggregate throughput 172 Mbps" is not. The current
dashboard leads with the aggregate, which is the less useful of the two for
every audience the PRD names.

Latency and jitter must carry their delivered-packets-only caveat (they are
computed over received packets, so lost packets contribute no delay); the
existing `meta.caveats` text is the source.

### Verdict sentence

One sentence generated from the selected scenario, naming the conditions, both
per-student figures, and the difference. For example:

> At 60 students streaming video, WiFi 6 gives each student 2.4 Mbps versus
> WiFi 5's 1.6 Mbps — about 50% more.

Where the two standards do not differ meaningfully, the sentence must say so
rather than manufacturing a contrast. At low densities neither standard is
stressed and the honest verdict is that both cope.

### Run again

"Run again" selects a different seed for the same conditions, so the numbers
visibly change. This implements the PRD's variability requirement and
demonstrates that a single run is not an answer. When only one trial exists for
a scenario, the control is disabled rather than replaying the same trial as if
it were new.

## 5. Data contract

`results.json` already carries per-trial records, so Sample Run needs no schema
change to work against the existing dataset.

Advanced conditions add two optional scenario fields, `interference` and
`room_depth_m`. They are additive: scenarios lacking them are core-matrix
scenarios. The parser must emit them only for runs that actually varied them.

The dashboard must derive available control values from the data at runtime, not
from a hardcoded list, so that options appear as the matrix grows without
frontend changes.

## 6. Scope and sequencing

Built against today's dataset the interface works for **video, single AP,
10-20 students**. Every other combination shows as unavailable.

This is deliberate. The UI ships ready and lights up as Phase 2 produces data,
rather than blocking on a matrix that takes days to run. The unavailable states
are a real part of the design and must be built, not stubbed.

## 7. Out of scope

- Live or on-demand simulation from the dashboard (PRD section 4, TRD section 8)
- Any backend, database, or API
- Conditions not present in the simulation matrix
- Deployment (a later phase)

## 8. Constraints carried forward

1. Every control maps to a real simulated parameter. No exceptions.
2. No fake progress indicator implying live measurement.
3. Provenance visible on every result view.
4. Metric keys in `results.json` unchanged; presentation only.
5. Unavailable combinations shown as unavailable, never substituted.
6. Where the standards do not differ, the verdict says so.
