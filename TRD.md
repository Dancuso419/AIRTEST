# Technical Requirements Document (TRD)
## Comparative Analysis of WiFi 5 vs WiFi 6 in Dense University Lecture Theatres

---

### 1. System Overview

Two independent components:

1. **Simulation pipeline** (offline, local machine): NS-3 generates raw network performance data for all scenario combinations, exported to structured JSON.
2. **Dashboard application** (static, hosted): A frontend-only web app that reads the generated JSON and visualizes it interactively. No backend server, database, or API required.

```
[NS-3 Simulations] --> [Trace/Output Parsing] --> [results.json] --> [React Dashboard] --> [Netlify/Vercel]
```

### 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Network simulator | NS-3 (latest stable release) | 802.11ac (VHT) and 802.11ax (HE) WiFi modules |
| Simulation scripting | C++ (native NS-3) | Python bindings (`ns3-py`) optional alternative |
| Fading/variability model | Nakagami-m fading + `RngSeedManager` | Introduces realistic run-to-run variation |
| Data export | NS-3 FlowMonitor → XML → parsed to JSON/CSV | Python script (pandas) for parsing/aggregation |
| Frontend framework | React (Vite) | No SSR needed |
| Charting | Recharts (or Chart.js) | Line charts, bar charts, radar chart |
| Data source | Static JSON file(s) bundled with frontend build | No API calls |
| Hosting | Netlify or Vercel | Free tier, static site hosting |
| Version control | Git + GitHub | Also hosts documentation/report source if desired |

### 3. Simulation Design (NS-3)

**Topology — primary scenario (single AP)**
- 1 Access Point at the front of the theatre
- N client stations (N = 20, 40, 60, 80, 100, 120, 150, 200) in a grid emulating seated rows (≈1 m seat pitch, ≈1.2 m row pitch)

**Topology — secondary scenario (multi-AP)**
- 3 APs distributed across the theatre, densities 60/120/200
- Included because real lecture theatres of this size are served by multiple APs, and because co-channel interference between overlapping BSSs is the condition under which WiFi 6's scheduling advantages are most pronounced. Single-AP results alone would not represent a realistic deployment.

**Standard configuration**
- WiFi 5: 802.11ac, VHT rates, no OFDMA
- WiFi 6: 802.11ax, HE rates, OFDMA enabled
- BSS coloring: applies to the **multi-AP scenario only** — it mitigates overlapping-BSS interference and has no effect in a single-AP topology. It must not be presented as a factor in single-AP results.

**Traffic generation and offered load**
- Web browsing: bursty on/off traffic, ≈0.5 Mbps mean per client
- Video streaming: CBR UDP, 3 Mbps per client
- Bulk download: long-lived TCP per client (rate-limited to 5 Mbps per client rather than fully saturating, so that offered load is a defined quantity and the satisfaction ratio is meaningful)

Offered load is recorded per run so that delivered throughput, loss, and satisfaction ratio reconcile. Note that at high densities offered load will exceed link capacity by design — this is the congestion condition under study, and results must show low satisfaction ratio and/or high loss accordingly.

**Channel/propagation model**
- `YansWifiChannel`
- `LogDistancePropagationLossModel` for baseline path loss
- `NakagamiPropagationLossModel` for fading

**Randomization**
- `RngSeedManager::SetSeed()` and `SetRun()` varied per trial
- 8 trials per (standard × density × traffic type × topology) combination

**Metrics extraction (via FlowMonitor)**
- Throughput (aggregate + per-flow → derive per-user)
- Delay (latency) and jitter (from FlowMonitor delay/jitter stats)
- Packet loss (lost packets ÷ transmitted packets)
- Satisfaction ratio (delivered aggregate throughput ÷ total offered load) — replaces association success rate, which in a fixed-station NS-3 topology associates all clients at startup and would read ≈100% in every run, carrying no information
- Fairness index: computed post-hoc using Jain's formula on per-flow throughput
- Airtime utilization: derived from PHY-layer state tracing (`WifiPhyStateHelper` trace sources)
- Energy efficiency (TWT proxy): **requires verification** of TWT support in the NS-3 version used; if unsupported, use estimated idle-airtime-per-client as a proxy, or omit and document as a limitation

### 4. Data Pipeline

1. NS-3 runs produce FlowMonitor XML output per trial.
2. A Python parsing script (pandas + `xml.etree`) extracts per-run metrics into a flat table.
3. Trials are grouped by (topology, standard, clients, traffic_type) and aggregated (mean, std dev) as well as kept as individual trial records.
4. Derived metric — **max supported clients**: the client count at which mean latency crosses the threshold, obtained by **linear interpolation between the two adjacent density points** that bracket the crossing. Interpolation is required because the true saturation point rarely coincides with a simulated density value; reporting only the nearest simulated point would be misleadingly coarse. Where no crossing occurs within the grid, the result is reported as ">200" rather than extrapolated.
5. Final structured output written to `results.json`.

**Threshold justification**

| Threshold | Value | Basis |
|---|---|---|
| Latency | 50 ms one-way | Aligns with ITU-T G.114's guidance that one-way delay up to ~150 ms is acceptable for interactive voice, with 50 ms chosen as a conservative bound for interactive classroom applications (live polling, video conferencing). Cite ITU-T G.114 in the report. |
| Packet loss | 5% | Commonly cited point beyond which video/VoIP quality degrades noticeably; cite a specific source in the literature review rather than asserting it. |

Both thresholds must be stated as **defined study parameters**, not objective facts, and a sensitivity note should show how max-supported-clients shifts if thresholds are varied (e.g., 30 ms / 100 ms).

### 5. Data Schema

Illustrative values below are consistent with a 100-client video scenario at 3 Mbps per client (300 Mbps offered load), where the medium cannot deliver full demand:

```json
{
  "scenarios": [
    {
      "topology": "single_ap",
      "standard": "wifi6",
      "clients": 100,
      "traffic_type": "video",
      "offered_load_mbps": 300.0,
      "trials": [
        {
          "seed": 1,
          "aggregate_throughput_mbps": 172.4,
          "per_user_throughput_mbps": 1.72,
          "latency_ms": 41.3,
          "jitter_ms": 6.8,
          "packet_loss_pct": 42.5,
          "satisfaction_ratio_pct": 57.5,
          "fairness_index": 0.88,
          "airtime_utilization_pct": 94.1,
          "energy_efficiency_score": 0.72
        }
      ]
    }
  ],
  "derived": {
    "max_supported_clients": [
      { "topology": "single_ap", "standard": "wifi5", "traffic_type": "video", "max_clients": 47, "method": "interpolated between 40 and 60" },
      { "topology": "single_ap", "standard": "wifi6", "traffic_type": "video", "max_clients": 73, "method": "interpolated between 60 and 80" }
    ]
  }
}
```

All figures above are placeholders for schema illustration only and must be replaced by simulated output. A consistency check in the parsing script should assert that `aggregate_throughput + lost_traffic ≈ offered_load` for every run.

### 6. Dashboard Requirements

**Views**
1. **Comparison view**: X-axis = client density, Y-axis = selected metric, two lines (WiFi 5 vs WiFi 6) with error bands showing ± standard deviation, filterable by traffic type and topology.
2. **Radar view**: All metrics normalized 0–1, one radar per density level, WiFi 5 vs WiFi 6 overlaid.
3. **Summary table**: Mean ± std dev for the current filter selection.
4. **"Sample Run" interaction**: On click, randomly selects one pre-computed trial from the matching scenario and displays it, illustrating run-to-run variance. The UI must label this explicitly (e.g., "Showing pre-computed trial #3 of 8 — results vary by random seed") so it is never mistaken for a live simulation. The report must document this as a presentation device.

**State management**: Local React state only (`useState`/`useReducer`) — no external state library needed given the scope.

**Data loading**: `results.json` imported directly or fetched from the same static bundle at load time (no external API).

### 7. Non-Functional Requirements

- **No backend dependency**: entire dashboard must function as static files.
- **Performance**: dashboard should load and render charts in under 2 seconds on a typical connection (dataset size is small — a few hundred KB of JSON).
- **Reproducibility**: NS-3 scripts and seeds must be version-controlled so simulation runs can be reproduced/re-verified.
- **Portability**: NS-3 environment should be containerized (Docker) or documented with exact version/dependency instructions, since NS-3 setup is notoriously fiddly.

### 8. Out of Scope (Explicitly)

- Live/on-demand NS-3 execution triggered from the dashboard
- Backend API, job queue, or database
- User authentication or multi-user features
- Real hardware testbed (no WiFi 5/6 devices available)
- Support for WiFi standards other than 802.11ac/ax

### 9. Environment & Tooling Setup

| Tool | Purpose |
|---|---|
| NS-3 (via Docker or native Linux build) | Simulation engine |
| Python 3.x + pandas | Parsing NS-3 output, generating `results.json` |
| Node.js + npm/yarn | Frontend build tooling |
| Git/GitHub | Version control |
| Netlify or Vercel CLI | Deployment |

### 10. Verification/Validation Plan

- **Runtime feasibility test (Phase 0)**: time a single 200-client run before committing to the full matrix. Total runs ≈ (8 densities × 3 traffic × 2 standards × 8 trials) + (3 densities × 3 traffic × 2 standards × 8 trials) = **528 runs**. If per-run time at high density makes this infeasible, reduce simulated duration, trim trial count to 5, or drop the least informative traffic type — and document the reduction.
- Sanity-check low-density (1–5 client) simulations against known theoretical throughput limits for 802.11ac/ax to confirm correct configuration before running the full matrix.
- Automated consistency assertions in the parsing script (throughput/loss/offered-load reconciliation; fairness index within 0–1).
- Cross-check trends against published empirical WiFi 6 studies (cited in literature review) to validate that simulated behavior is directionally consistent with real-world findings.
