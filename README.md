# AIRTEST

**WiFi 5 (802.11ac) against WiFi 6 (802.11ax) in a dense university lecture theatre.**

An NS-3 simulation study and the instrument panel that reads it. The panel
replays stored trials; it never measures anything live, and it never offers a
condition the simulation did not run.

Hosted on Render as a static site; see `render.yaml`.

---

## What it measures

Both standards are run through identical rooms and identical traffic, and
eight figures are compared: speed per student, total speed, lag, jitter, data
lost, demand met, fairness, and airwave usage. Where the two separate is the
finding; where they do not, the panel says so rather than inventing a winner.

### Conditions actually simulated

| | |
|---|---|
| Students | 10, 14, 20 |
| Activity | browsing, streaming, downloading |
| Access points | 1, 3 |
| Seeds | 2 per cell |
| Measurement window | 3 s inside a 5 s run |

That is 36 scenarios over 72 runs, all present in `data/results.json`.

## What it does not measure

These are limits of the study, not of the dashboard, and the write-up should
state them rather than bury them.

- **Density stops at 20 students.** 40 and 60 were planned and never run: WiFi
  6 costs roughly 9x its WiFi 5 equivalent and hits a sharp cost knee between
  16 and 20 clients, putting the full grid days away. Nothing here speaks to a
  full 200-seat theatre.
- **Packet loss is inflated by the short window.** Packets still queued when
  the window closes count as lost, and queues deepen with density, so the loss
  curve is steeper than a steady-state run would show.
- **Lag and jitter are conditioned on delivery.** They are computed over
  packets that arrived. The ones that never arrived would have been the
  slowest, so both understate delay wherever loss is non-trivial.
- **Demand met is measured against nominal demand.** The web profile's 0.5
  Mbps per client is a long-run mean of an on/off source, so a short window can
  exceed 100% with zero loss.

Each of these is shown on the back of the dial it qualifies, not in a footnote.

## Layout

```
sim/lecture-theatre.cc   the parameterised NS-3 scenario
sim/run_matrix.py        batch runner, idempotent and fault tolerant
pipeline/parse.py        FlowMonitor XML -> results.json, with reconciliation checks
data/results.json        the published dataset
dashboard/               React + Vite panel that replays it
docs/                    specs, plans, verification notes
```

## Running it

The dashboard needs only Node:

```bash
cd dashboard
npm install
npm run dev      # http://localhost:5173
npm test         # replay arithmetic and every evaluation sentence
npm run build
```

Re-running the simulation needs NS-3 3.42 built with the Spectrum PHY, and
takes hours. `sim/lecture-theatre.cc` goes in `ns-3.42/scratch/`, then:

```bash
python3 sim/run_matrix.py --outdir ~/wifi-sim/raw --workers 4
python3 pipeline/parse.py --raw ~/wifi-sim/raw --out data/results.json
```

`run_matrix.py` skips any run whose four artifacts already exist, so an
interrupted matrix resumes where it stopped.

## Two things worth knowing about the simulation

**OFDMA needs the Spectrum PHY.** On the Yans PHY, WiFi 6 delivers zero
packets — HE MU PPDUs are dropped outright. `SpectrumWifiPhy` with
`MultiModelSpectrumChannel` is mandatory, and `DlMuAckSequenceType` must be set
*before* the first `wifi.Install`.

**Two runs abort inside NS-3 3.42.** `multi_ap_wifi6_web_c20_s2` and
`multi_ap_wifi6_bulk_c20_s1` both die with `Unsupported Wi-Fi modulation class
EHT` — an 802.11ax PHY being asked for an 802.11be entity. It is seed-specific
and upstream; both cells were re-run on seed 3 and the failures stay recorded
in the run manifest rather than being erased.

## Licence

Final-year project. No licence granted.
