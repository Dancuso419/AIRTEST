# Design Spec: WiFi 5 vs WiFi 6 in Dense Lecture Theatres

Date: 2026-09-01
Status: Approved
Source documents: `PRD.md`, `TRD.md`, `BUILD (3).md`

---

## 1. Purpose

Build the two systems the PRD/TRD call for: an NS-3 simulation pipeline that
generates WiFi 5 vs WiFi 6 performance data across a density/traffic matrix, and
a static React dashboard that visualises it. This spec covers *how* they get
built and in what order. It does not restate requirements already fixed in the
PRD and TRD; it records the decisions those documents leave open.

## 2. Build strategy: vertical slice, then widen

The project risk is not in any single component. It is in the **seams** between
them: whether FlowMonitor yields usable jitter, whether delivered throughput and
loss reconcile against offered load, whether the JSON schema survives contact
with real output, and how long a 200-client run actually takes.

Therefore: push one thin path end to end before widening any axis.

**The slice:** `single_ap x {wifi5, wifi6} x video x {20, 60, 120} x 2 seeds` =
**12 runs**.

Video (CBR UDP) is chosen for the slice because its offered load is exactly
known (3 Mbps x N clients), which makes the throughput/loss/offered-load
reconciliation assertion verifiable by hand. TCP bulk download would leave
offered load fuzzy at precisely the moment the parser is being validated.

Once the slice is green, widen one axis at a time in this order: traffic types,
then densities, then trial count, then multi-AP topology. Each widening is
mechanical and re-uses the same code path.

## 3. Environment

Verified present on the build machine: Docker 29.6.2, WSL2 (Ubuntu), Node
v24.14.1, Python 3.14.3, git 2.54.0, 8 CPU cores, 16 GB RAM.

**Decision: NS-3 is built natively inside WSL2 Ubuntu, not in Docker.**

Rationale: a Docker bind mount across the Windows/WSL boundary imposes an I/O
penalty on every one of ~528 runs, and an image plus its build tree would store
the NS-3 artifacts twice. The host `F:` volume has ~18 GB free (93% full),
which does not comfortably fit both.

The TRD's portability requirement (section 7) is satisfied instead by a pinned
NS-3 version plus a documented, re-runnable setup script rather than an image.

**Disk risk.** ~18 GB free is a genuine constraint. Raw FlowMonitor XML for 528
runs at up to 200 clients may be large. Mitigations, applied in order as needed:
keep `data/raw/` inside the WSL2 ext4 filesystem rather than on `F:`; gzip raw
XML after parsing; delete raw XML for runs whose metrics are already committed to
`results.json`. Raw output is reproducible from seeds, so it is not precious.

## 4. Repository layout

```
docs/         PRD, TRD, BUILD + superpowers/specs/
sim/          NS-3 scenario source + batch runner
pipeline/     Python parser, tests, results.json generator
dashboard/    Vite + React app
data/         raw/ (gitignored) + results.json (committed)
```

Four folders, one concern each. `data/raw/` is gitignored (bulky, regenerable);
`data/results.json` is committed because the dashboard build depends on it and
it is a project deliverable.

## 5. Component design

### 5.1 sim/ — NS-3 scenario

**One parameterised scenario file**, `sim/lecture-theatre.cc`, not one per
standard. WiFi 5 and WiFi 6 differ by a `WifiStandard` enum value and OFDMA
configuration, not by structural topology; two files would be one file plus an
inevitable divergence bug.

Parameters via NS-3 `CommandLine`:

| Flag | Values |
|---|---|
| `--standard` | `wifi5` or `wifi6` |
| `--clients` | integer |
| `--traffic` | `web`, `video`, or `bulk` |
| `--aps` | `1` or `3` |
| `--seed` | integer (drives `RngSeedManager::SetRun`) |
| `--duration` | simulated seconds |
| `--out` | output path prefix |

Topology, propagation, fading, and traffic parameters follow TRD section 3
verbatim. BSS coloring is enabled **only** when `--aps 3` and
`--standard wifi6`, per the TRD's explicit constraint that it has no meaning in
a single-AP topology and must not be presented as a single-AP factor.

**Each run emits two files**, not one:

- `<out>.xml` — FlowMonitor output (throughput, delay, jitter, loss)
- `<out>.phy.json` — PHY state totals (tx / rx / busy / idle seconds), captured
  from `WifiPhyStateHelper` trace sources

The second file exists because airtime utilization is a required metric (PRD
metric 7) that FlowMonitor does not provide. The TRD names the trace source but
does not specify a transport; making it an explicit second artifact keeps it
from being discovered late.

### 5.2 sim/ — batch runner

`sim/run_matrix.py`, in Python rather than shell, since Python is already a
dependency for parsing.

- `multiprocessing.Pool` with **6 workers** (8 cores, 2 left for the host)
- **Idempotent**: a run whose output files already exist is skipped. 528 runs
  will be interrupted at some point; restartability is a requirement, not a
  nicety.
- **Fault tolerant**: a run that crashes, times out, or exits non-zero is logged
  to a failures manifest and does not halt the batch.
- Records per-run wall-clock time, feeding the TRD's runtime feasibility
  assessment.

### 5.3 pipeline/ — parser

`pipeline/parse.py`: `data/raw/*` to per-run metric records to grouped
aggregates to `data/results.json`, matching the TRD section 5 schema
(individual trials retained alongside mean and standard deviation).

Responsibilities:

- Per-flow to aggregate and per-user throughput; delay; jitter; packet loss
- Jain's fairness index computed post-hoc from per-flow throughput
- Airtime utilization from the `.phy.json` companion file
- Satisfaction ratio = delivered aggregate throughput / offered load
- Energy efficiency proxy, **conditional on the Step 0 TWT verification**;
  omitted and documented as a limitation if unsupported
- Derived `max_supported_clients` by linear interpolation between the two
  bracketing density points; reported as `">N"`, N being the largest density actually simulated, where no crossing occurs
  within the grid, never extrapolated
- Threshold sensitivity recomputation at 30 ms and 100 ms alongside the primary
  50 ms figure
- **Consistency assertions** (TRD section 5): delivered throughput plus lost
  traffic is approximately offered load, per run; fairness index within [0, 1]
- **Missing-trial reporting**: a scenario with fewer than the expected trials is
  reported explicitly, never silently averaged over a smaller sample

### 5.4 dashboard/ — React app

Vite + React + Recharts. `results.json` is imported directly into the bundle
(a few hundred KB) — no fetch, no loading state, no error state for data
retrieval. Local `useState` only; no state library at this scope.

Components:

- `ComparisonChart` — density on X, selected metric on Y, WiFi 5 vs WiFi 6 lines
  with plus/minus one std dev error bands; filtered by traffic type and topology
- `RadarView` — all metrics normalised 0 to 1, WiFi 5 vs WiFi 6 overlaid at a
  chosen density
- `SummaryTable` — mean and std dev for the current filter selection
- `SampleRun` — displays one randomly selected pre-computed trial

`SampleRun` **must** carry visible labelling that the trial is pre-computed and
not a live simulation (PRD risk register; TRD section 6). This is a correctness
requirement about honest presentation, not a styling preference.

Every chart carries units and a legend.

## 6. Data flow

```
lecture-theatre.cc   per run          ->  <id>.xml + <id>.phy.json
run_matrix.py        orchestrates     ->  6-way parallel, idempotent, fault tolerant
parse.py             metrics          ->  aggregation, assertions, interpolation
data/results.json    bundled at build ->  React dashboard  ->  Vercel/Netlify
```

## 7. Testing

`pipeline/test_parse.py` — the parser is where silent wrongness lives, so it is
what gets tested:

- Jain's fairness index against hand-computed values, including the degenerate
  all-equal case (equals 1.0) and the single-flow case
- Interpolation against a known bracket
- The no-crossing case returning `">N"` for the top of the measured grid rather than an extrapolated number
- The reconciliation assertion firing on deliberately inconsistent input

The NS-3 scenario is not unit tested. It is validated by the baseline check in
Step 2 below: 1 to 5 client runs compared against published theoretical
throughput limits for 802.11ac and 802.11ax. A misconfigured PHY shows up there
immediately and cheaply.

## 8. Implementation order

**Step 0 — Foundation.** Git repository; `.gitignore`; native NS-3 build in WSL2
at a pinned version; confirm the VHT (802.11ac) and HE (802.11ax) modules are
present; **verify whether TWT is implemented**, which decides whether the energy
efficiency metric exists at all.

**Step 1 — Scenario.** `lecture-theatre.cc`: single AP, video traffic, all
parameters wired, both output artifacts emitted.

**Step 2 — Baseline validation.** Run 1 to 5 clients for both standards; compare
against published theoretical limits. Do not proceed until configuration is
confirmed correct — every later result depends on this being right.

**Step 3 — Runner and the slice.** `run_matrix.py`; execute the 12 slice runs;
record real per-run timings and extrapolate the full 528-run matrix cost.

**Step 4 — Parser.** `parse.py` plus `test_parse.py`; produce the first real
`results.json` from slice output.

**Step 5 — Dashboard.** Scaffold Vite/React; build `ComparisonChart` against
that real JSON. Because the slice supplies real data before any UI work begins,
there is no mock dataset and no later mock-to-real swap.

**Then widen**, one axis at a time: traffic types (web, bulk), then remaining
densities, then trials to 8, then multi-AP topology. Remaining dashboard views
(`RadarView`, `SummaryTable`, `SampleRun`) and deployment follow once the
dataset is broad enough to make them meaningful.

## 9. Scope boundaries

Unchanged from PRD section 4 and TRD section 8: no backend, no database, no
authentication, no live simulation triggered from the dashboard, no hardware
testbed, no WiFi standards outside 802.11ac/ax.

## 10. Constraints carried forward

These are constraints the source documents establish that implementation must
not quietly violate:

1. Satisfaction ratio replaces association success rate, which reads about 100%
   in any fixed-station NS-3 topology and carries no information.
2. BSS coloring applies to the multi-AP scenario only and must never be
   presented as a factor in single-AP results.
3. The 50 ms latency and 5% packet loss thresholds are **defined study
   parameters**, not objective facts, and must be reported as such with a
   sensitivity analysis.
4. Offered load exceeding link capacity at high density is the condition under
   study, not a bug. Results must show correspondingly low satisfaction ratio
   and high loss.
5. Counter-intuitive results are investigated and explained, never discarded.
6. Energy efficiency is provisional pending the Step 0 TWT verification.
