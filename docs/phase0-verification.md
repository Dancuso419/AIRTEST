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
**Build location:** `~/wifi-sim/ns-3.42` (WSL2 Ubuntu 24.04.2 LTS, ext4)
**Build date:** 2026-09-01

## Module availability

- 802.11ac (VHT): PRESENT — `grep -c "WIFI_STANDARD_80211ac" src/wifi/model/wifi-standards.h` returned 5
- 802.11ax (HE): PRESENT — `grep -c "WIFI_STANDARD_80211ax" src/wifi/model/wifi-standards.h` returned 5
- `src/wifi/model/he/` present with `rr-multi-user-scheduler.cc`, `rr-multi-user-scheduler.h`, and `constant-obss-pd-algorithm.cc`
- `wifi-he-network` example runs: YES — `./ns3 run "wifi-he-network --simulationTime=1s --frequency=5 --useRts=0"` exited 0 with sample throughputs: MCS 9 / 80 MHz / 800 ns GI = 346.466 Mbit/s; MCS 9 / 160 MHz / 1600 ns GI = 511.65 Mbit/s; MCS 8 / 80 MHz / 800 ns GI = 317.167 Mbit/s

## TWT (Target Wake Time)

- Implemented in mainline: NO
- Evidence: no filenames matching `twt` under `src/wifi/model/` or `src/wifi/model/he/`; `grep -ril "target wake time" src/wifi/` returned no matches

**Consequence:** TWT is absent from mainline, so the energy efficiency metric (PRD metric 9) is
omitted from `results.json` and recorded as a limitation in the methodology
chapter. It is not approximated or fabricated.

## Build deviations from setup-ns3.sh

The build actually run was `sim/build-ns3-nosudo.sh`, not `sim/setup-ns3.sh`. Reasons:

- No `sudo` was available (interactive password required), so the `apt-get` install step was skipped. Of its packages, `g++`, `cmake`, `python3`, `wget`, `tar`, and `pkg-config` were already installed; `ninja` and `libxml2-dev` were missing but optional here (Unix Makefiles replace Ninja, and FlowMonitor's `SerializeToXmlFile` writes XML directly through ostream instead of ConfigStore's path).

- Used `--build-profile=optimized` instead of default debug profile, and `--enable-modules` limited to `wifi,internet,applications,mobility,flow-monitor,network,core,propagation,stats`. Reason: WSL ext4.vhdx stored on `C:` had only 5.18 GB free with dynamic growth reporting ~949 GB virtual capacity; default all-modules debug build (8–10 GB) would exhaust system drive. Result: 246 MB build tree, zero compilation errors, vhdx did not grow, `C:` free space unchanged at 3.63 GB.

- Optimized profile compiles out `NS_LOG` and `NS_ASSERT` while `NS_FATAL_ERROR` remains, so scenario parameter guards stay effective. Optimized runs are substantially faster than debug, important across the 528-run matrix.

- `sim/setup-ns3.sh` is retained as the documented reproducible path for clean machines with root access.
