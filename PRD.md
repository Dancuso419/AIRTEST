# Product Requirements Document (PRD)
## Comparative Analysis of WiFi 5 vs WiFi 6 in Dense University Lecture Theatres

---

### 1. Overview
This project investigates the performance difference between WiFi 5 (802.11ac) and WiFi 6 (802.11ax) in high-density environments such as university lecture theatres, where 100+ devices may compete for the same wireless medium. Since no physical WiFi 5/6 hardware is available, the study is conducted through **network simulation (NS-3)**, supported by an **interactive web dashboard** that visualizes results and reflects run-to-run variability observed across randomized trials.

### 2. Problem Statement
University lecture theatres are among the most WiFi-dense environments on campus. Legacy WiFi 5 networks struggle under this load — dropped connections, poor video streaming, high latency during interactive polling apps. WiFi 6 introduces features (OFDMA, improved MU-MIMO, BSS coloring, TWT) explicitly designed for dense deployments, but many universities haven't quantified whether upgrading is worth it. This project provides that quantified comparison.

### 3. Goals & Objectives
- Quantify performance differences between WiFi 5 and WiFi 6 as client density increases.
- Identify which WiFi 6 mechanisms (principally OFDMA, and inter-AP contention handling in the multi-AP case) account for any observed differences.
- Determine the practical saturation point (max supported clients) for each standard under realistic lecture-theatre traffic.
- Present findings through an accessible, interactive dashboard suitable for both academic evaluation and practical IT decision-making.
- Produce a reproducible simulation methodology with statistically characterised variability, rather than single deterministic runs.

### 4. Non-Goals
- No physical WiFi 5/6 hardware testing (unavailable).
- No live, on-demand simulation triggering from the dashboard (out of scope — pre-generated data only).
- No backend server, database, or user authentication.
- No support for WiFi standards outside 802.11ac/ax (e.g., no WiFi 4 or WiFi 7 comparison).

### 5. Target Users
- **Primary**: Project supervisor / examiners evaluating the FYP.
- **Secondary**: University IT/network planning staff who might reference the findings when deciding on WiFi upgrades.

### 6. Key Features

| Feature | Description | Priority |
|---|---|---|
| NS-3 simulation suite | Simulates WiFi 5 and WiFi 6 under varying client density and traffic types | Must-have |
| Multi-trial variability | Multiple randomized-seed runs per scenario, with fading, to characterise variance | Must-have |
| Static dataset (JSON) | Pre-generated results consumed by the dashboard, no backend required | Must-have |
| Interactive dashboard | Metric selector, density axis, traffic-type filter, WiFi5 vs WiFi6 comparison charts | Must-have |
| "Sample Run" interaction | Displays an individual randomly-selected trial to illustrate real-world run-to-run variance | Must-have |
| Summary/derived metrics | Max supported clients (interpolated), mean ± standard deviation across trials | Should-have |
| Multi-AP secondary scenario | 3-AP topology to capture co-channel interference, where WiFi 6 gains are largest | Should-have |
| Radar/at-a-glance view | Normalised multi-metric comparison at a chosen density | Should-have |
| Energy efficiency (TWT proxy) | Included only if NS-3's 802.11ax module supports TWT | Could-have |

### 7. Metrics to Measure

1. Aggregate throughput (Mbps)
2. Per-user throughput (Mbps)
3. Latency (ms)
4. Jitter (ms)
5. Packet loss (%)
6. Fairness index (Jain's Fairness Index, 0–1)
7. Airtime/channel utilization (%)
8. Offered-load satisfaction ratio (delivered throughput ÷ offered load, %) — replaces association success rate, which is not informative in a fixed-station NS-3 topology
9. Energy efficiency (TWT proxy, if supported by NS-3) — provisional
10. Max supported clients (derived per traffic type, by interpolation against defined degradation thresholds)

### 8. Test Scenarios (Parameter Matrix)

**Primary scenario — single AP**
- **Standards**: WiFi 5 (802.11ac), WiFi 6 (802.11ax)
- **Client densities**: 20, 40, 60, 80, 100, 120, 150, 200 — finer steps in the 40–120 range so the saturation point falls between measured points rather than outside the grid
- **Traffic types**: Web browsing (bursty), video streaming (CBR), bulk file download (TCP)
- **Trials per combination**: 8 (varied random seeds + fading model)

**Secondary scenario — multi-AP (3 APs)**
- Same standards and traffic types, densities 60/120/200, 8 trials
- Captures co-channel interference and inter-BSS contention, which is where BSS coloring and OFDMA scheduling matter most and where single-AP results would understate WiFi 6's advantage

### 9. User Stories

- As an examiner, I want to compare WiFi 5 and WiFi 6 throughput at increasing density, so I can see where and whether a meaningful gap emerges.
- As a viewer, I want to switch between metrics (latency, jitter, fairness, etc.), so I can explore the full picture, not just throughput.
- As a viewer, I want to filter by traffic type and AP count, so I can see how each standard behaves under different real-world conditions.
- As a viewer, I want to see both averaged results and an individual sampled run, so I understand both the trend and the variance behind it.
- As a reader of the final report, I want a clear "max supported clients" figure per standard, so I get a concrete, quotable takeaway.

### 10. Success Criteria

Success is defined by the quality and validity of the comparison, not by a particular outcome.

- Baseline low-density simulations validate against published theoretical throughput limits for 802.11ac/ax, confirming correct simulator configuration.
- The full parameter matrix runs to completion with variance characterised across trials (mean ± standard deviation reported for every metric).
- Results are internally consistent (e.g., delivered throughput, offered load, and packet loss reconcile with one another).
- Whatever the direction of results, findings are explained with reference to the underlying mechanisms and compared against published empirical studies.
- Dashboard is deployed, publicly accessible, and visualizes all core metrics with filtering.
- Final report documents methodology, results, limitations, and an evidence-based recommendation for university deployment.

### 11. Risks & Constraints

| Risk | Mitigation |
|---|---|
| No real hardware available | Full simulation-based approach; explicitly documented as a limitation in methodology |
| NS-3 802.11ax module limitations (e.g., TWT not implemented) | Verify in Phase 0; treat energy efficiency as provisional and drop if unsupported |
| High-density simulations (150–200 clients) may be slow | Estimate runtime in Phase 0 with a timing test; reduce trial count or shorten simulated duration if the matrix is infeasible |
| Saturation point may fall outside the density grid | Finer density steps in the 40–120 range plus interpolation |
| Sampled-run display could be mistaken for live simulation | Explicitly documented in the report and labelled in the UI as a pre-computed trial |
| Overly complex build (backend, live simulation) | Explicitly de-scoped in favor of static-data dashboard |

### 12. Deliverables

1. NS-3 simulation scripts + configuration files
2. Generated dataset (JSON/CSV) covering full parameter matrix with multiple trials
3. Deployed interactive web dashboard (Netlify/Vercel)
4. Final project report/documentation (per academic requirements)
