# Build Plan
## Comparative Analysis of WiFi 5 vs WiFi 6 in Dense University Lecture Theatres

---

### Phase 0: Setup & Feasibility (Week 1-2)
- [ ] Install NS-3 (native Linux build or Docker container) — verify version and confirm 802.11ac (VHT) and 802.11ax (HE) WiFi modules are present
- [ ] Verify whether TWT (Target Wake Time) is implemented in the installed NS-3 version (determines if energy efficiency metric is included)
- [ ] **Runtime feasibility test**: run one 200-client simulation and record wall-clock time. Multiply out against the 528-run matrix. If total runtime is infeasible on available hardware, reduce simulated duration, cut trials from 8 to 5, or drop a traffic type — and record the decision as a documented constraint
- [ ] Set up Git repository (simulation code, parsing scripts, dashboard, docs in clearly separated folders)
- [ ] Set up Node.js + React (Vite) project scaffold for the dashboard
- [ ] Begin literature review: gather 8-12 papers on WiFi 6/802.11ax performance in dense environments; identify citable sources for the 50 ms latency and 5% packet loss thresholds

### Phase 1: Baseline Simulation (Week 3-4)
- [ ] Build a minimal NS-3 scenario: 1 AP, 1-5 clients, WiFi 5 only
- [ ] Validate throughput/latency output against known theoretical values for 802.11ac
- [ ] Repeat baseline for WiFi 6 (802.11ax), confirm HE rates and OFDMA config are active
- [ ] Confirm FlowMonitor is correctly capturing per-flow throughput, delay, jitter, loss
- [ ] **Produce a mock `results.json`** with the correct schema and plausible placeholder values, so dashboard work in Phase 4 is not blocked waiting on real data

### Phase 2: Full Scenario Matrix (Week 5-8)
- [ ] Parameterize simulation script: topology, standard, client count, traffic type, seed
- [ ] Implement traffic generators: web (bursty on/off, ~0.5 Mbps/client), video (CBR UDP, 3 Mbps/client), bulk download (TCP, rate-limited 5 Mbps/client)
- [ ] Record offered load per run so throughput/loss/satisfaction reconcile
- [ ] Add Nakagami-m fading model
- [ ] Build multi-AP (3 AP) secondary topology; enable BSS coloring for WiFi 6 in this scenario only
- [ ] Write batch runner: single-AP (8 densities × 3 traffic × 2 standards × 8 trials) + multi-AP (3 densities × 3 traffic × 2 standards × 8 trials) ≈ 528 runs
- [ ] Run full matrix; store raw FlowMonitor XML output per run

### Phase 3: Data Processing (Week 9-10)
- [ ] Write Python parsing script: FlowMonitor XML → per-run metrics
- [ ] Compute fairness index (Jain's formula) per run from per-flow throughput
- [ ] Compute airtime utilization from PHY trace sources
- [ ] Compute satisfaction ratio (delivered ÷ offered load)
- [ ] Compute (or omit, if unsupported) energy efficiency proxy
- [ ] Compute derived max supported clients via linear interpolation between bracketing density points; report ">N" for the largest density actually measured where no threshold crossing occurs
- [ ] Run sensitivity check: recompute max supported clients at alternative thresholds (30 ms / 100 ms) for the discussion chapter
- [ ] Add automated consistency assertions (throughput + loss ≈ offered load; fairness index within 0–1)
- [ ] Aggregate into final `results.json` matching the TRD schema
- [ ] Review dataset against literature — investigate and explain any counter-intuitive results rather than discarding them

### Phase 4: Dashboard Build (Week 5-12, parallel to simulation work)
- [ ] Scaffold React app; develop against the **mock `results.json`** from Phase 1
- [ ] Build comparison view: metric selector, density x-axis, WiFi5 vs WiFi6 lines with ± std dev error bands, traffic-type and topology filters
- [ ] Build summary table component (mean ± std dev for current filter)
- [ ] Build radar/at-a-glance view for normalised multi-metric comparison
- [ ] Implement "Sample Run" interaction with explicit UI labelling that the trial is pre-computed, not live
- [ ] Swap mock data for real `results.json` once Phase 3 completes
- [ ] Style/polish UI (clear labeling, legends, units on every chart)
- [ ] Deploy to Netlify or Vercel; confirm public URL works end-to-end

### Phase 5: Analysis & Write-Up (Week 13-16)
- [ ] Write Introduction chapter (problem, motivation, objectives, scope)
- [ ] Write Literature Review chapter (802.11ac/ax standards, OFDMA/MU-MIMO/BSS coloring, prior dense-network studies, threshold sources)
- [ ] Write Methodology chapter (simulation design, parameters, topologies, thresholds, validity checks, limitations of simulation-only approach)
- [ ] Write System Design & Implementation chapter (NS-3 architecture, data pipeline, dashboard architecture; document the "Sample Run" feature as a presentation device using pre-computed trials)
- [ ] Write Results & Analysis chapter (charts, mean ± std dev, statistical comparison, per-metric discussion, single-AP vs multi-AP contrast)
- [ ] Write Conclusion & Recommendations chapter (deployment guidance, max-supported-clients headline results, threshold sensitivity, future work)
- [ ] Compile References and Appendices (scripts, raw dataset, dashboard link)
- [ ] Internal review pass: check every figure matches the dataset and all metrics are addressed
- [ ] Supervisor review + revisions

### Phase 6: Final Polish & Defense Prep (Week 17-18)
- [ ] Rehearse dashboard demo; be ready to explain that sampled runs are pre-computed trials
- [ ] Prepare defense slides highlighting headline results (max supported clients, fairness index gap, single- vs multi-AP contrast)
- [ ] Final proofread of documentation
- [ ] Submit

---

### Milestone Checklist (Quick Reference)

| Milestone | Target Week |
|---|---|
| NS-3 environment working, runtime feasibility confirmed | Week 2 |
| Baseline validated + mock dataset ready | Week 4 |
| Full simulation matrix generated | Week 8 |
| `results.json` finalized | Week 10 |
| Dashboard deployed and functional | Week 12 |
| Full draft of documentation | Week 16 |
| Final submission-ready package | Week 18 |
