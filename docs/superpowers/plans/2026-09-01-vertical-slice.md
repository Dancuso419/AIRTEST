# WiFi 5 vs WiFi 6 Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push one thin path end to end — NS-3 simulation, FlowMonitor and PHY output, Python parser, `results.json`, React chart — proving every seam works before the full 528-run matrix is attempted.

**Architecture:** A single parameterised NS-3 C++ scenario emits two artifacts per run (FlowMonitor XML plus a PHY-state JSON companion). A Python batch runner executes runs in parallel, idempotently. A Python parser turns raw output into per-run metrics, aggregates them with mean and standard deviation, computes derived figures, and writes a single `results.json`. A Vite/React dashboard bundles that JSON directly. No backend anywhere.

**Tech Stack:** NS-3 3.42 (C++), Python 3 + pytest, Node 24 + Vite + React + Recharts, WSL2 Ubuntu, git.

**Spec:** `docs/superpowers/specs/2026-09-01-wifi5-vs-wifi6-design.md`

## Global Constraints

- **NS-3 version is pinned.** Use the `ns-3.42` release tarball. Record the exact version in `sim/README.md`. Do not use a git `master` checkout.
- **Where things run.** NS-3, the batch runner, and the parser all run **inside WSL2 Ubuntu**, against the WSL ext4 filesystem (`~/wifi-sim/`) — not against `/mnt/f/`. Only the final `data/results.json` is written back across to the Windows repo. The dashboard runs on Windows with Node 24. Crossing the filesystem boundary once per matrix is fine; crossing it 528 times is not.
- **The Windows repo is the source of truth for code.** `sim/*.cc` and `pipeline/*.py` are edited in `F:\PROJECTS\AIRTEST\` and copied into WSL to run. Never edit the WSL copy directly.
- **Slice matrix:** `single_ap x {wifi5, wifi6} x video x {20, 60, 120} x seeds {1, 2}` = 12 runs. Do not widen any axis in this plan.
- **Simulated duration:** 20 seconds per run, with application traffic starting at t=2s (after association completes) and statistics measured over t=2s to t=20s.
- **Traffic direction is downlink**: applications on the AP, packet sinks on the clients. A lecture theatre streams and downloads; it does not upload.
- **Video traffic:** CBR UDP at 3.0 Mbps per client, 1200-byte payload. Offered load is exactly `3.0 * clients` Mbps and must be recorded per run.
- **Metric name `satisfaction_ratio_pct` replaces association success rate.** Association success rate reads ~100% in a fixed-station NS-3 topology and must not be emitted.
- **BSS coloring is not touched in this plan.** It applies only to the multi-AP scenario and must never appear in single-AP results.
- **Thresholds are study parameters, not facts:** latency 50 ms (primary), with 30 ms and 100 ms sensitivity variants; packet loss 5%.
- **Energy efficiency is conditional** on the TWT verification in Task 1. If TWT is unsupported, the metric is omitted entirely and recorded as a documented limitation — it is never faked.
- **JSON schema** follows spec section 5.3 and TRD section 5: individual trials retained alongside mean and standard deviation.

---

### Task 1: WSL2 NS-3 build and capability verification

**Files:**
- Create: `sim/setup-ns3.sh`
- Create: `sim/README.md`
- Create: `docs/phase0-verification.md`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working NS-3 build at `~/wifi-sim/ns-3.42/` inside WSL, invokable as `./ns3 run`. A recorded yes/no answer on TWT support that Task 6 depends on.

This task has no unit test — its test is that the build completes and NS-3's own example programs run. Do not skip the verification steps; every later result depends on the simulator being correctly configured.

- [ ] **Step 1: Write the setup script**

Create `sim/setup-ns3.sh`:

```bash
#!/usr/bin/env bash
# Builds NS-3 3.42 inside WSL2 Ubuntu. Run from WSL, not from Windows.
set -euo pipefail

NS3_VERSION="3.42"
WORKDIR="${HOME}/wifi-sim"

sudo apt-get update
sudo apt-get install -y \
  g++ cmake ninja-build python3 python3-pip python3-venv \
  libxml2 libxml2-dev pkg-config wget tar

mkdir -p "${WORKDIR}"
cd "${WORKDIR}"

if [ ! -d "ns-3.${NS3_VERSION}" ]; then
  wget -q "https://www.nsnam.org/releases/ns-allinone-${NS3_VERSION}.tar.bz2"
  tar xjf "ns-allinone-${NS3_VERSION}.tar.bz2"
  mv "ns-allinone-${NS3_VERSION}/ns-${NS3_VERSION}" .
  rm -rf "ns-allinone-${NS3_VERSION}" "ns-allinone-${NS3_VERSION}.tar.bz2"
fi

cd "ns-${NS3_VERSION}"
./ns3 configure --enable-examples --disable-werror
./ns3 build

echo "NS-3 ${NS3_VERSION} built at ${WORKDIR}/ns-${NS3_VERSION}"
```

- [ ] **Step 2: Run the setup script inside WSL**

Run, from a WSL shell:

```bash
wsl
mkdir -p ~/wifi-sim
cp /mnt/f/PROJECTS/AIRTEST/sim/setup-ns3.sh ~/wifi-sim/
chmod +x ~/wifi-sim/setup-ns3.sh
~/wifi-sim/setup-ns3.sh
```

Expected: build completes with `Build finished successfully`. This takes 20 to 60 minutes on 8 cores. If it fails on a missing dependency, install it, add it to the `apt-get` line in the script, and re-run.

- [ ] **Step 3: Verify the VHT (802.11ac) and HE (802.11ax) modules are present**

Run:

```bash
cd ~/wifi-sim/ns-3.42
grep -c "WIFI_STANDARD_80211ac" src/wifi/model/wifi-standards.h
grep -c "WIFI_STANDARD_80211ax" src/wifi/model/wifi-standards.h
ls src/wifi/model/he/ | head
./ns3 run "wifi-he-network --simulationTime=1 --frequency=5 --useRts=0"
```

Expected: both `grep` counts are at least 1; `src/wifi/model/he/` lists HE PHY and MU-scheduler sources; the `wifi-he-network` example prints a throughput table without crashing. If the example does not run, the build is not usable — stop and fix it before continuing.

- [ ] **Step 4: Verify whether TWT is implemented**

Run:

```bash
cd ~/wifi-sim/ns-3.42
grep -ril "target wake time" src/wifi/ | head
grep -ril "twt" src/wifi/model/ | head
```

Expected: most likely **no meaningful matches**, because TWT is not in mainline NS-3 3.42. Record the actual result either way. A hit in a filename such as `*twt*.cc` or `*twt*.h` means TWT support exists; matches only inside comments or unrelated identifiers do not count.

- [ ] **Step 5: Record the verification results**

Create `docs/phase0-verification.md` with the actual observed output:

```markdown
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
```

- [ ] **Step 6: Write sim/README.md**

Create `sim/README.md`:

```markdown
# Simulation

NS-3 3.42, built natively in WSL2 Ubuntu at `~/wifi-sim/ns-3.42`.

## Setup

From a WSL shell:

    cp /mnt/f/PROJECTS/AIRTEST/sim/setup-ns3.sh ~/wifi-sim/
    chmod +x ~/wifi-sim/setup-ns3.sh
    ~/wifi-sim/setup-ns3.sh

## Running a single scenario

Scenario source lives here and is copied into NS-3's `scratch/` directory
to build:

    cp /mnt/f/PROJECTS/AIRTEST/sim/lecture-theatre.cc ~/wifi-sim/ns-3.42/scratch/
    cd ~/wifi-sim/ns-3.42
    ./ns3 build
    ./ns3 run "lecture-theatre --standard=wifi6 --clients=60 --traffic=video --seed=1 --out=/tmp/testrun"

Produces `/tmp/testrun.xml` (FlowMonitor) and `/tmp/testrun.phy.json` (PHY state).

Code is edited in the Windows repo and copied in. Never edit the WSL copy.
```

- [ ] **Step 7: Commit**

```bash
git add sim/setup-ns3.sh sim/README.md docs/phase0-verification.md
git commit -m "feat(sim): NS-3 3.42 setup script and Phase 0 verification"
```

---

### Task 2: Parameterised scenario with FlowMonitor output

**Files:**
- Create: `sim/lecture-theatre.cc`

**Interfaces:**
- Consumes: the NS-3 3.42 build from Task 1.
- Produces: an executable accepting `--standard {wifi5|wifi6}`, `--clients N`, `--traffic {web|video|bulk}`, `--aps {1|3}`, `--seed N`, `--duration N`, `--out PREFIX`. Writes `<PREFIX>.xml` in FlowMonitor format. Task 3 extends the same file; Task 5 invokes it; Task 6 parses its output.

Only `--traffic video` and `--aps 1` need to work in this plan. The other values parse and exit with a clear message rather than silently doing something wrong.

- [ ] **Step 1: Write the scenario**

Create `sim/lecture-theatre.cc`:

```cpp
// Lecture-theatre WiFi density scenario: 802.11ac vs 802.11ax.
// One parameterised scenario; standards differ by enum + OFDMA config,
// not by structure.
#include "ns3/core-module.h"
#include "ns3/network-module.h"
#include "ns3/mobility-module.h"
#include "ns3/internet-module.h"
#include "ns3/wifi-module.h"
#include "ns3/applications-module.h"
#include "ns3/flow-monitor-module.h"

#include <string>

using namespace ns3;

NS_LOG_COMPONENT_DEFINE("LectureTheatre");

int
main(int argc, char* argv[])
{
    std::string standard = "wifi6";
    std::string traffic = "video";
    uint32_t clients = 20;
    uint32_t aps = 1;
    uint32_t seed = 1;
    double duration = 20.0;
    std::string out = "run";

    CommandLine cmd(__FILE__);
    cmd.AddValue("standard", "wifi5 (802.11ac) or wifi6 (802.11ax)", standard);
    cmd.AddValue("traffic", "web, video, or bulk", traffic);
    cmd.AddValue("clients", "Number of client stations", clients);
    cmd.AddValue("aps", "Number of access points (1 or 3)", aps);
    cmd.AddValue("seed", "RNG run number for this trial", seed);
    cmd.AddValue("duration", "Simulated seconds", duration);
    cmd.AddValue("out", "Output path prefix", out);
    cmd.Parse(argc, argv);

    if (standard != "wifi5" && standard != "wifi6")
    {
        NS_FATAL_ERROR("--standard must be wifi5 or wifi6, got: " << standard);
    }
    if (traffic != "video")
    {
        NS_FATAL_ERROR("--traffic " << traffic << " is not implemented yet; "
                       << "only 'video' is available in the current slice.");
    }
    if (aps != 1)
    {
        NS_FATAL_ERROR("--aps " << aps << " is not implemented yet; "
                       << "only single-AP topology is available in the current slice.");
    }

    // Per-trial randomisation. Seed is fixed; the run number varies per trial,
    // which is the pattern NS-3 documents for independent replications.
    RngSeedManager::SetSeed(12345);
    RngSeedManager::SetRun(seed);

    NodeContainer apNode;
    apNode.Create(1);
    NodeContainer staNodes;
    staNodes.Create(clients);

    // Channel: log-distance path loss plus Nakagami-m fading, so repeated
    // trials with different run numbers actually differ.
    YansWifiChannelHelper channel;
    channel.SetPropagationDelay("ns3::ConstantSpeedPropagationDelayModel");
    channel.AddPropagationLoss("ns3::LogDistancePropagationLossModel",
                               "Exponent", DoubleValue(3.0),
                               "ReferenceDistance", DoubleValue(1.0),
                               "ReferenceLoss", DoubleValue(46.6777));
    channel.AddPropagationLoss("ns3::NakagamiPropagationLossModel");

    YansWifiPhyHelper phy;
    phy.SetChannel(channel.Create());
    phy.Set("ChannelSettings", StringValue("{0, 80, BAND_5GHZ, 0}"));

    WifiHelper wifi;
    if (standard == "wifi5")
    {
        wifi.SetStandard(WIFI_STANDARD_80211ac);
    }
    else
    {
        wifi.SetStandard(WIFI_STANDARD_80211ax);
    }
    wifi.SetRemoteStationManager("ns3::IdealWifiManager");

    Ssid ssid = Ssid("lecture-theatre");
    WifiMacHelper mac;

    mac.SetType("ns3::StaWifiMac", "Ssid", SsidValue(ssid));
    NetDeviceContainer staDevices = wifi.Install(phy, mac, staNodes);

    if (standard == "wifi6")
    {
        // OFDMA downlink scheduling. This is the mechanism under study and is
        // the defining difference from the wifi5 configuration.
        mac.SetType("ns3::ApWifiMac",
                    "Ssid", SsidValue(ssid),
                    "EnableBeaconJitter", BooleanValue(false));
        mac.SetMultiUserScheduler("ns3::RrMultiUserScheduler",
                                  "EnableUlOfdma", BooleanValue(false),
                                  "EnableBsrp", BooleanValue(false));
    }
    else
    {
        mac.SetType("ns3::ApWifiMac",
                    "Ssid", SsidValue(ssid),
                    "EnableBeaconJitter", BooleanValue(false));
    }
    NetDeviceContainer apDevice = wifi.Install(phy, mac, apNode);

    // Seated grid: 1.0 m seat pitch, 1.2 m row pitch, 10 seats per row.
    // AP at the front of the theatre, 3 m up.
    MobilityHelper mobility;
    Ptr<ListPositionAllocator> apPos = CreateObject<ListPositionAllocator>();
    apPos->Add(Vector(5.0, -2.0, 3.0));
    mobility.SetPositionAllocator(apPos);
    mobility.SetMobilityModel("ns3::ConstantPositionMobilityModel");
    mobility.Install(apNode);

    mobility.SetPositionAllocator("ns3::GridPositionAllocator",
                                  "MinX", DoubleValue(0.0),
                                  "MinY", DoubleValue(0.0),
                                  "DeltaX", DoubleValue(1.0),
                                  "DeltaY", DoubleValue(1.2),
                                  "GridWidth", UintegerValue(10),
                                  "LayoutType", StringValue("RowFirst"));
    mobility.SetMobilityModel("ns3::ConstantPositionMobilityModel");
    mobility.Install(staNodes);

    InternetStackHelper stack;
    stack.Install(apNode);
    stack.Install(staNodes);

    Ipv4AddressHelper address;
    address.SetBase("10.1.1.0", "255.255.255.0");
    Ipv4InterfaceContainer apInterface = address.Assign(apDevice);
    Ipv4InterfaceContainer staInterfaces = address.Assign(staDevices);

    // Downlink CBR UDP video: AP sends, each client receives.
    // Offered load is exactly 3.0 Mbps * clients, which makes the
    // throughput/loss/offered-load reconciliation checkable by hand.
    const double perClientMbps = 3.0;
    const uint32_t payloadBytes = 1200;
    const uint16_t basePort = 5000;
    const double appStart = 2.0;

    ApplicationContainer sinks;
    ApplicationContainer sources;

    for (uint32_t i = 0; i < clients; ++i)
    {
        uint16_t port = basePort + i;

        PacketSinkHelper sinkHelper("ns3::UdpSocketFactory",
                                    InetSocketAddress(Ipv4Address::GetAny(), port));
        sinks.Add(sinkHelper.Install(staNodes.Get(i)));

        OnOffHelper onoff("ns3::UdpSocketFactory",
                          InetSocketAddress(staInterfaces.GetAddress(i), port));
        onoff.SetAttribute("OnTime",
                           StringValue("ns3::ConstantRandomVariable[Constant=1]"));
        onoff.SetAttribute("OffTime",
                           StringValue("ns3::ConstantRandomVariable[Constant=0]"));
        onoff.SetAttribute("DataRate",
                           DataRateValue(DataRate(perClientMbps * 1e6)));
        onoff.SetAttribute("PacketSize", UintegerValue(payloadBytes));
        sources.Add(onoff.Install(apNode.Get(0)));
    }

    sinks.Start(Seconds(0.0));
    sinks.Stop(Seconds(duration));
    // Traffic starts after association has settled, so the measurement window
    // is not polluted by association overhead.
    sources.Start(Seconds(appStart));
    sources.Stop(Seconds(duration));

    FlowMonitorHelper flowmonHelper;
    Ptr<FlowMonitor> monitor = flowmonHelper.InstallAll();

    Simulator::Stop(Seconds(duration + 1.0));
    Simulator::Run();

    monitor->CheckForLostPackets();
    monitor->SerializeToXmlFile(out + ".xml", true, true);

    Simulator::Destroy();
    return 0;
}
```

- [ ] **Step 2: Build the scenario**

Run:

```bash
cp /mnt/f/PROJECTS/AIRTEST/sim/lecture-theatre.cc ~/wifi-sim/ns-3.42/scratch/
cd ~/wifi-sim/ns-3.42
./ns3 build
```

Expected: `Build finished successfully`, with `scratch/lecture-theatre` among the built targets. Fix any compile errors before continuing — API drift between NS-3 releases is the likeliest cause, so check the signatures in `src/wifi/helper/` against the release you actually built.

- [ ] **Step 3: Run a smoke test and confirm XML output**

Run:

```bash
cd ~/wifi-sim/ns-3.42
./ns3 run "lecture-theatre --standard=wifi6 --clients=20 --traffic=video --seed=1 --duration=20 --out=/tmp/smoke"
ls -la /tmp/smoke.xml
head -30 /tmp/smoke.xml
grep -c "<Flow " /tmp/smoke.xml
```

Expected: `/tmp/smoke.xml` exists and is non-empty; the head shows `<FlowMonitor>` and `<FlowStats>` elements; the flow count is at least 20 (one downlink flow per client, possibly more from ARP or other control traffic).

- [ ] **Step 4: Confirm the parameter guards work**

Run:

```bash
cd ~/wifi-sim/ns-3.42
./ns3 run "lecture-theatre --traffic=bulk --out=/tmp/guard" ; echo "exit=$?"
./ns3 run "lecture-theatre --standard=wifi7 --out=/tmp/guard" ; echo "exit=$?"
```

Expected: both abort with the explicit "not implemented yet" / "must be wifi5 or wifi6" message and a non-zero exit code. A silent success here would mean unimplemented traffic types quietly produce wrong data later.

- [ ] **Step 5: Confirm wifi5 also runs and differs from wifi6**

Run:

```bash
cd ~/wifi-sim/ns-3.42
./ns3 run "lecture-theatre --standard=wifi5 --clients=20 --traffic=video --seed=1 --out=/tmp/smoke5"
ls -la /tmp/smoke5.xml /tmp/smoke.xml
```

Expected: both files exist. They should differ in size or content — identical output from both standards means the standard flag is not taking effect, which must be fixed now rather than discovered after 528 runs.

- [ ] **Step 6: Commit**

```bash
git add sim/lecture-theatre.cc
git commit -m "feat(sim): parameterised single-AP video scenario with FlowMonitor output"
```

---

### Task 3: PHY state tracing to a JSON companion file

**Files:**
- Modify: `sim/lecture-theatre.cc`

**Interfaces:**
- Consumes: the scenario from Task 2.
- Produces: `<PREFIX>.phy.json` alongside `<PREFIX>.xml`, with the exact shape below. Task 6's `parse_phy()` reads this file.

```json
{
  "ap_tx_s": 12.4,
  "ap_rx_s": 1.1,
  "ap_busy_s": 3.2,
  "ap_idle_s": 1.3,
  "measured_window_s": 18.0
}
```

Airtime utilization is a required metric (PRD metric 7) and FlowMonitor does not provide it. This is why the second artifact exists.

- [ ] **Step 1: Add the PHY state accumulator**

Insert into `sim/lecture-theatre.cc`, after the `NS_LOG_COMPONENT_DEFINE` line:

```cpp
#include <fstream>
#include <map>

// Accumulated time the AP's PHY spent in each state. Airtime utilization is
// derived from this; FlowMonitor cannot supply it.
struct PhyStateTotals
{
    double tx = 0.0;
    double rx = 0.0;
    double busy = 0.0;
    double idle = 0.0;
};

static PhyStateTotals g_apPhy;
static double g_phyWindowStart = 0.0;

static void
PhyStateTrace(std::string context, Time start, Time duration, WifiPhyState state)
{
    // Only count time inside the measurement window; association traffic
    // before appStart would otherwise inflate idle time.
    double startS = start.GetSeconds();
    double endS = startS + duration.GetSeconds();
    if (endS <= g_phyWindowStart)
    {
        return;
    }
    double counted = endS - std::max(startS, g_phyWindowStart);

    switch (state)
    {
    case WifiPhyState::TX:
        g_apPhy.tx += counted;
        break;
    case WifiPhyState::RX:
        g_apPhy.rx += counted;
        break;
    case WifiPhyState::CCA_BUSY:
    case WifiPhyState::SWITCHING:
        g_apPhy.busy += counted;
        break;
    case WifiPhyState::IDLE:
        g_apPhy.idle += counted;
        break;
    default:
        break;
    }
}
```

- [ ] **Step 2: Connect the trace and write the file**

In `main()`, immediately before `Simulator::Stop(...)`, add:

```cpp
    g_phyWindowStart = appStart;
    Config::Connect("/NodeList/0/DeviceList/0/$ns3::WifiNetDevice/Phy/State/State",
                    MakeCallback(&PhyStateTrace));
```

Then, after `monitor->SerializeToXmlFile(...)` and before `Simulator::Destroy()`, add:

```cpp
    {
        std::ofstream phyOut(out + ".phy.json");
        phyOut << "{\n"
               << "  \"ap_tx_s\": " << g_apPhy.tx << ",\n"
               << "  \"ap_rx_s\": " << g_apPhy.rx << ",\n"
               << "  \"ap_busy_s\": " << g_apPhy.busy << ",\n"
               << "  \"ap_idle_s\": " << g_apPhy.idle << ",\n"
               << "  \"measured_window_s\": " << (duration - appStart) << "\n"
               << "}\n";
    }
```

Node 0 is the AP, because `apNode` is created before `staNodes`. The AP's PHY is the right vantage point: it observes the whole BSS medium.

- [ ] **Step 3: Rebuild and run**

Run:

```bash
cp /mnt/f/PROJECTS/AIRTEST/sim/lecture-theatre.cc ~/wifi-sim/ns-3.42/scratch/
cd ~/wifi-sim/ns-3.42
./ns3 build
./ns3 run "lecture-theatre --standard=wifi6 --clients=60 --traffic=video --seed=1 --out=/tmp/phytest"
cat /tmp/phytest.phy.json
```

Expected: valid JSON with four non-negative state times and `measured_window_s: 18`.

- [ ] **Step 4: Sanity-check that the state times reconcile**

Verify by inspection: `ap_tx_s + ap_rx_s + ap_busy_s + ap_idle_s` should be approximately `measured_window_s` (18.0), within about 1%. A large shortfall means states are being dropped by the `switch`; a large excess means the window clamp is wrong. Either must be fixed now.

At 60 clients offering 180 Mbps, `ap_idle_s` should be small — the medium is congested by design. Near-total idle would mean traffic is not flowing and the scenario is broken.

- [ ] **Step 5: Commit**

```bash
git add sim/lecture-theatre.cc
git commit -m "feat(sim): emit PHY state totals for airtime utilization"
```

---

### Task 4: Baseline validation against theoretical limits

**Files:**
- Create: `docs/baseline-validation.md`

**Interfaces:**
- Consumes: the scenario from Tasks 2 and 3.
- Produces: a recorded confirmation that the PHY is correctly configured. No code.

This is the cheapest possible check on the most expensive possible mistake. A misconfigured PHY produces results that look plausible and are entirely wrong. Do not proceed to Task 5 until this passes.

- [ ] **Step 1: Run low-density trials for both standards**

Run:

```bash
cd ~/wifi-sim/ns-3.42
for std in wifi5 wifi6; do
  for n in 1 3 5; do
    ./ns3 run "lecture-theatre --standard=$std --clients=$n --traffic=video --seed=1 --out=/tmp/base-$std-$n"
  done
done
ls -la /tmp/base-*
```

Expected: six XML files and six `.phy.json` files.

- [ ] **Step 2: Extract delivered throughput per run**

Run this one-liner per file to total the received bytes:

```bash
for f in /tmp/base-*.xml; do
  echo -n "$f: "
  python3 -c "
import sys, xml.etree.ElementTree as ET
t = ET.parse('$f').getroot()
rx = sum(int(fl.get('rxBytes')) for fl in t.iter('Flow'))
print(f'{rx*8/18e6:.2f} Mbps delivered')
"
done
```

Expected: at 1 client, offered load is 3 Mbps and the medium is nowhere near saturated, so delivered throughput should be close to 3 Mbps for both standards. At 5 clients, offered load is 15 Mbps and should still be delivered nearly in full.

- [ ] **Step 3: Check against theoretical limits**

At 80 MHz on 5 GHz, a single spatial stream reaches roughly 433 Mbps PHY rate for 802.11ac and roughly 600 Mbps for 802.11ax, with real MAC-layer throughput typically 60 to 70% of that. The 1 to 5 client runs offer only 3 to 15 Mbps, far below either ceiling.

The check is therefore: **delivered throughput must be approximately equal to offered load at these densities, for both standards, with near-zero loss.** If delivered throughput is materially below offered load at 1 client, the configuration is wrong — likely causes are a bad `ChannelSettings` string, a rate manager failing to pick a high MCS, or clients too far from the AP for the propagation model.

- [ ] **Step 4: Record the results**

Create `docs/baseline-validation.md`:

```markdown
# Baseline Validation

Purpose: confirm the NS-3 PHY/MAC configuration is correct before running the
full matrix. Low-density runs must deliver approximately their full offered
load; failure here invalidates every later result.

Configuration: 80 MHz, 5 GHz, single spatial stream, IdealWifiManager,
log-distance (exponent 3.0) plus Nakagami fading. 20 s simulated, 18 s
measurement window from t=2 s.

| Standard | Clients | Offered (Mbps) | Delivered (Mbps) | Ratio |
|---|---|---|---|---|
| wifi5 | 1 | 3.0 | <fill in> | <fill in> |
| wifi5 | 3 | 9.0 | <fill in> | <fill in> |
| wifi5 | 5 | 15.0 | <fill in> | <fill in> |
| wifi6 | 1 | 3.0 | <fill in> | <fill in> |
| wifi6 | 3 | 9.0 | <fill in> | <fill in> |
| wifi6 | 5 | 15.0 | <fill in> | <fill in> |

## Theoretical reference

802.11ac, 80 MHz, 1 spatial stream: ~433 Mbps PHY, ~260-300 Mbps achievable MAC.
802.11ax, 80 MHz, 1 spatial stream: ~600 Mbps PHY, ~380-420 Mbps achievable MAC.

Offered loads of 3-15 Mbps are far below both ceilings, so near-full delivery
is the expected result and is what validates the configuration.

## Verdict

PASS / FAIL — <state which, and if FAIL, what was changed to fix it>
```

- [ ] **Step 5: Commit**

```bash
git add docs/baseline-validation.md
git commit -m "docs: baseline validation against theoretical 802.11ac/ax limits"
```

---

### Task 5: Idempotent parallel batch runner

**Files:**
- Create: `sim/run_matrix.py`

**Interfaces:**
- Consumes: the built `scratch/lecture-theatre` binary.
- Produces: `data/raw/<run_id>.xml` and `data/raw/<run_id>.phy.json` for each slice combination, plus `data/raw/_manifest.json`. Run id format is `{topology}_{standard}_{traffic}_c{clients}_s{seed}`, for example `single_ap_wifi6_video_c60_s1`. Task 6's parser globs these files and parses the run id back into fields.

- [ ] **Step 1: Write the runner**

Create `sim/run_matrix.py`:

```python
#!/usr/bin/env python3
"""Batch-run the NS-3 lecture theatre scenario.

Idempotent: runs whose output already exists are skipped, because a 528-run
matrix will be interrupted. Fault tolerant: a failed run is recorded and does
not halt the batch.
"""
import argparse
import itertools
import json
import multiprocessing
import subprocess
import time
from pathlib import Path

NS3_DIR = Path.home() / "wifi-sim" / "ns-3.42"

# The vertical slice. Widening happens in a later plan, not here.
SLICE = {
    "topology": ["single_ap"],
    "standard": ["wifi5", "wifi6"],
    "traffic": ["video"],
    "clients": [20, 60, 120],
    "seed": [1, 2],
}

DURATION = 20.0
TIMEOUT_S = 3600


def run_id(topology, standard, traffic, clients, seed):
    return f"{topology}_{standard}_{traffic}_c{clients}_s{seed}"


def combinations(matrix):
    keys = ["topology", "standard", "traffic", "clients", "seed"]
    for values in itertools.product(*(matrix[k] for k in keys)):
        yield dict(zip(keys, values))


def execute(job):
    outdir = Path(job["outdir"])
    rid = run_id(job["topology"], job["standard"], job["traffic"],
                 job["clients"], job["seed"])
    prefix = outdir / rid

    xml_path = prefix.with_suffix(".xml")
    phy_path = Path(str(prefix) + ".phy.json")
    if xml_path.exists() and phy_path.exists():
        return {"run_id": rid, "status": "skipped", "seconds": 0.0}

    aps = 3 if job["topology"] == "multi_ap" else 1
    args = (
        f"lecture-theatre "
        f"--standard={job['standard']} "
        f"--clients={job['clients']} "
        f"--traffic={job['traffic']} "
        f"--aps={aps} "
        f"--seed={job['seed']} "
        f"--duration={DURATION} "
        f"--out={prefix}"
    )

    started = time.monotonic()
    try:
        proc = subprocess.run(
            ["./ns3", "run", args],
            cwd=NS3_DIR,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        return {"run_id": rid, "status": "timeout",
                "seconds": time.monotonic() - started}

    elapsed = time.monotonic() - started
    if proc.returncode != 0:
        return {"run_id": rid, "status": "failed", "seconds": elapsed,
                "returncode": proc.returncode, "stderr": proc.stderr[-2000:]}

    if not (xml_path.exists() and phy_path.exists()):
        return {"run_id": rid, "status": "missing_output", "seconds": elapsed}

    return {"run_id": rid, "status": "ok", "seconds": elapsed}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default=str(Path.home() / "wifi-sim" / "raw"))
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    jobs = [dict(c, outdir=str(outdir)) for c in combinations(SLICE)]
    print(f"{len(jobs)} runs, {args.workers} workers, output to {outdir}")

    with multiprocessing.Pool(args.workers) as pool:
        results = []
        for r in pool.imap_unordered(execute, jobs):
            results.append(r)
            print(f"[{len(results)}/{len(jobs)}] {r['run_id']}: "
                  f"{r['status']} ({r['seconds']:.1f}s)")

    manifest = {
        "total": len(results),
        "ok": sum(1 for r in results if r["status"] == "ok"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "failed": [r for r in results if r["status"]
                   not in ("ok", "skipped")],
        "runs": results,
    }
    (outdir / "_manifest.json").write_text(json.dumps(manifest, indent=2))

    ok_times = [r["seconds"] for r in results if r["status"] == "ok"]
    if ok_times:
        mean_s = sum(ok_times) / len(ok_times)
        print(f"\nmean run time: {mean_s:.1f}s")
        print(f"extrapolated 528-run matrix at {args.workers} workers: "
              f"{528 * mean_s / args.workers / 3600:.1f} hours")

    if manifest["failed"]:
        print(f"\n{len(manifest['failed'])} run(s) failed - see _manifest.json")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the 12-run slice**

Run:

```bash
cp /mnt/f/PROJECTS/AIRTEST/sim/run_matrix.py ~/wifi-sim/
cd ~/wifi-sim
python3 run_matrix.py --outdir ~/wifi-sim/raw --workers 6
```

Expected: 12 lines of progress, each ending `ok`, then a mean run time and an extrapolated matrix cost. Note the extrapolation — it is the TRD's runtime feasibility figure. If it exceeds roughly 48 hours, record that and flag it; the mitigations (shorter duration, 5 trials, drop a traffic type) belong to the widening plan, not this one.

- [ ] **Step 3: Verify idempotency**

Run the exact same command again:

```bash
cd ~/wifi-sim
python3 run_matrix.py --outdir ~/wifi-sim/raw --workers 6
```

Expected: all 12 report `skipped` and it completes in seconds. This is the property that makes a 528-run batch survivable, so verify it rather than assuming it.

- [ ] **Step 4: Verify fault tolerance**

Run, with a deliberately broken matrix entry:

```bash
cd ~/wifi-sim
python3 -c "
import run_matrix
run_matrix.SLICE['traffic'] = ['bulk']
run_matrix.main()
" --outdir ~/wifi-sim/raw-faulttest --workers 2
cat ~/wifi-sim/raw-faulttest/_manifest.json | head -20
```

Expected: runs report `failed` (the scenario rejects `--traffic=bulk`), the batch completes rather than crashing, and `_manifest.json` records the failures with stderr. Then remove the test directory: `rm -rf ~/wifi-sim/raw-faulttest`.

- [ ] **Step 5: Commit**

```bash
git add sim/run_matrix.py
git commit -m "feat(sim): idempotent fault-tolerant parallel batch runner"
```

---

### Task 6: Parser — per-run metrics with reconciliation

**Files:**
- Create: `pipeline/parse.py`
- Test: `pipeline/test_parse.py`

**Interfaces:**
- Consumes: `data/raw/*.xml` and `data/raw/*.phy.json` from Task 5.
- Produces, for Task 7:
  - `parse_run_id(run_id: str) -> dict` with keys `topology`, `standard`, `traffic_type`, `clients`, `seed`
  - `jains_fairness(throughputs: list[float]) -> float`
  - `parse_phy(path: Path) -> dict` with key `airtime_utilization_pct`
  - `parse_flowmonitor(path: Path, window_s: float) -> dict` with keys `aggregate_throughput_mbps`, `per_flow_throughput_mbps` (list), `latency_ms`, `jitter_ms`, `packet_loss_pct`
  - `offered_load_mbps(traffic_type: str, clients: int) -> float`
  - `check_reconciliation(delivered_mbps, loss_pct, offered_mbps, tolerance_pct=5.0) -> None`, raising `ReconciliationError` on failure

- [ ] **Step 1: Write the failing tests**

Create `pipeline/test_parse.py`:

```python
import math
import pytest
from parse import (
    ReconciliationError,
    check_reconciliation,
    jains_fairness,
    offered_load_mbps,
    parse_run_id,
)


def test_run_id_round_trips_all_fields():
    got = parse_run_id("single_ap_wifi6_video_c60_s2")
    assert got == {
        "topology": "single_ap",
        "standard": "wifi6",
        "traffic_type": "video",
        "clients": 60,
        "seed": 2,
    }


def test_run_id_handles_multi_ap_underscore_in_topology():
    got = parse_run_id("multi_ap_wifi5_bulk_c200_s8")
    assert got["topology"] == "multi_ap"
    assert got["standard"] == "wifi5"
    assert got["clients"] == 200


def test_fairness_is_one_when_all_flows_equal():
    assert jains_fairness([5.0, 5.0, 5.0, 5.0]) == pytest.approx(1.0)


def test_fairness_is_one_for_single_flow():
    assert jains_fairness([7.3]) == pytest.approx(1.0)


def test_fairness_of_maximally_unfair_split_is_one_over_n():
    # One flow gets everything, three get nothing: J = 1/n.
    assert jains_fairness([12.0, 0.0, 0.0, 0.0]) == pytest.approx(0.25)


def test_fairness_hand_computed_case():
    # J = (sum x)^2 / (n * sum x^2) = 36 / (3 * 56) = 0.2142857...
    assert jains_fairness([2.0, 4.0, 6.0]) == pytest.approx(144 / (3 * 56))


def test_fairness_of_all_zero_flows_is_zero_not_nan():
    result = jains_fairness([0.0, 0.0, 0.0])
    assert result == 0.0
    assert not math.isnan(result)


def test_fairness_always_within_unit_interval():
    for flows in ([1.0, 99.0], [3.0] * 50, [0.1, 0.2, 0.3, 100.0]):
        assert 0.0 <= jains_fairness(flows) <= 1.0


def test_offered_load_for_video_is_three_mbps_per_client():
    assert offered_load_mbps("video", 100) == pytest.approx(300.0)


def test_reconciliation_passes_when_delivered_plus_loss_matches_offered():
    # 300 Mbps offered, 42.5% lost, so ~172.5 Mbps delivered.
    check_reconciliation(delivered_mbps=172.5, loss_pct=42.5, offered_mbps=300.0)


def test_reconciliation_raises_when_numbers_do_not_add_up():
    # Claiming 90% delivery AND 42.5% loss is impossible.
    with pytest.raises(ReconciliationError):
        check_reconciliation(delivered_mbps=270.0, loss_pct=42.5,
                             offered_mbps=300.0)


def test_reconciliation_raises_when_delivered_exceeds_offered():
    with pytest.raises(ReconciliationError):
        check_reconciliation(delivered_mbps=400.0, loss_pct=0.0,
                             offered_mbps=300.0)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd /mnt/f/PROJECTS/AIRTEST/pipeline
python3 -m pytest test_parse.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'parse'`. (If `pytest` is missing: `python3 -m pip install pytest`.)

- [ ] **Step 3: Write the parser**

Create `pipeline/parse.py`:

```python
#!/usr/bin/env python3
"""Turn NS-3 raw output into per-run metrics and an aggregated results.json."""
import json
import re
import statistics
import xml.etree.ElementTree as ET
from pathlib import Path

# Offered load per client, in Mbps, by traffic type. These must match the
# values the NS-3 scenario actually generates.
PER_CLIENT_OFFERED_MBPS = {
    "web": 0.5,
    "video": 3.0,
    "bulk": 5.0,
}

RUN_ID_RE = re.compile(
    r"^(?P<topology>single_ap|multi_ap)_"
    r"(?P<standard>wifi5|wifi6)_"
    r"(?P<traffic_type>web|video|bulk)_"
    r"c(?P<clients>\d+)_"
    r"s(?P<seed>\d+)$"
)


class ReconciliationError(ValueError):
    """Delivered throughput, loss, and offered load do not add up."""


def parse_run_id(run_id):
    m = RUN_ID_RE.match(run_id)
    if not m:
        raise ValueError(f"unparseable run id: {run_id}")
    d = m.groupdict()
    d["clients"] = int(d["clients"])
    d["seed"] = int(d["seed"])
    return d


def offered_load_mbps(traffic_type, clients):
    return PER_CLIENT_OFFERED_MBPS[traffic_type] * clients


def jains_fairness(throughputs):
    """Jain's fairness index: (sum x)^2 / (n * sum x^2), in [1/n, 1]."""
    n = len(throughputs)
    if n == 0:
        return 0.0
    total = sum(throughputs)
    sq = sum(x * x for x in throughputs)
    if sq == 0:
        # Every flow got nothing. Undefined by the formula; report 0 rather
        # than NaN so downstream aggregation and the [0,1] assertion hold.
        return 0.0
    return (total * total) / (n * sq)


def check_reconciliation(delivered_mbps, loss_pct, offered_mbps,
                         tolerance_pct=5.0):
    """Assert delivered + lost is approximately offered (TRD section 5)."""
    if offered_mbps <= 0:
        raise ReconciliationError(f"offered load must be positive, got {offered_mbps}")
    if delivered_mbps > offered_mbps * (1 + tolerance_pct / 100):
        raise ReconciliationError(
            f"delivered {delivered_mbps:.2f} Mbps exceeds offered "
            f"{offered_mbps:.2f} Mbps")
    implied = offered_mbps * (1 - loss_pct / 100)
    if implied == 0:
        return
    drift = abs(delivered_mbps - implied) / offered_mbps * 100
    if drift > tolerance_pct:
        raise ReconciliationError(
            f"delivered {delivered_mbps:.2f} Mbps but {loss_pct:.1f}% loss on "
            f"{offered_mbps:.2f} Mbps offered implies {implied:.2f} Mbps "
            f"(drift {drift:.1f}% > {tolerance_pct}%)")


def parse_phy(path):
    raw = json.loads(Path(path).read_text())
    window = raw["measured_window_s"]
    if window <= 0:
        raise ValueError(f"non-positive PHY window in {path}")
    busy = raw["ap_tx_s"] + raw["ap_rx_s"] + raw["ap_busy_s"]
    return {"airtime_utilization_pct": round(busy / window * 100, 2)}


def parse_flowmonitor(path, window_s):
    """Extract aggregate and per-flow metrics from FlowMonitor XML.

    FlowMonitor reports delaySum and jitterSum as NS-3 time strings such as
    '+1234567ns'; they are converted to milliseconds per received packet.
    """
    root = ET.parse(path).getroot()
    per_flow_mbps = []
    total_rx_bytes = 0
    total_tx_packets = 0
    total_lost_packets = 0
    delay_ms_weighted = 0.0
    jitter_ms_weighted = 0.0
    total_rx_packets = 0

    for flow in root.iter("Flow"):
        rx_bytes = int(flow.get("rxBytes"))
        rx_packets = int(flow.get("rxPackets"))
        tx_packets = int(flow.get("txPackets"))
        lost = int(flow.get("lostPackets"))

        # Ignore control/ARP flows that carried no application payload.
        if tx_packets == 0:
            continue

        per_flow_mbps.append(rx_bytes * 8 / window_s / 1e6)
        total_rx_bytes += rx_bytes
        total_tx_packets += tx_packets
        total_lost_packets += lost
        total_rx_packets += rx_packets

        if rx_packets > 0:
            delay_ms_weighted += _ns_to_ms(flow.get("delaySum")) 
            jitter_ms_weighted += _ns_to_ms(flow.get("jitterSum"))

    aggregate_mbps = total_rx_bytes * 8 / window_s / 1e6
    loss_pct = (total_lost_packets / total_tx_packets * 100
                if total_tx_packets else 0.0)
    latency_ms = (delay_ms_weighted / total_rx_packets
                  if total_rx_packets else 0.0)
    jitter_ms = (jitter_ms_weighted / total_rx_packets
                 if total_rx_packets else 0.0)

    return {
        "aggregate_throughput_mbps": round(aggregate_mbps, 3),
        "per_flow_throughput_mbps": [round(x, 4) for x in per_flow_mbps],
        "latency_ms": round(latency_ms, 3),
        "jitter_ms": round(jitter_ms, 3),
        "packet_loss_pct": round(loss_pct, 3),
    }


def _ns_to_ms(timestr):
    """Convert an NS-3 serialised time such as '+1234567.0ns' to milliseconds."""
    s = timestr.strip().lstrip("+")
    if s.endswith("ns"):
        return float(s[:-2]) / 1e6
    if s.endswith("ms"):
        return float(s[:-2])
    if s.endswith("s"):
        return float(s[:-1]) * 1000
    return float(s) / 1e6
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
cd /mnt/f/PROJECTS/AIRTEST/pipeline
python3 -m pytest test_parse.py -v
```

Expected: all 12 tests PASS.

- [ ] **Step 5: Parse one real run end to end**

Run:

```bash
cd /mnt/f/PROJECTS/AIRTEST/pipeline
python3 -c "
from pathlib import Path
from parse import parse_flowmonitor, parse_phy, offered_load_mbps, check_reconciliation, jains_fairness
import os
raw = Path(os.path.expanduser('~/wifi-sim/raw'))
xml = raw / 'single_ap_wifi6_video_c60_s1.xml'
flow = parse_flowmonitor(xml, 18.0)
phy = parse_phy(raw / 'single_ap_wifi6_video_c60_s1.phy.json')
offered = offered_load_mbps('video', 60)
print('offered', offered)
print(flow['aggregate_throughput_mbps'], flow['latency_ms'], flow['packet_loss_pct'])
print(phy)
print('fairness', jains_fairness(flow['per_flow_throughput_mbps']))
check_reconciliation(flow['aggregate_throughput_mbps'], flow['packet_loss_pct'], offered)
print('reconciliation OK')
"
```

Expected: offered load 180.0 Mbps; a plausible delivered throughput; latency and loss printed; airtime utilization as a percentage; fairness within [0, 1]; and `reconciliation OK`.

If reconciliation fails, do not loosen the tolerance to make it pass. Investigate: the usual causes are a wrong measurement window, counting ARP flows as application traffic, or FlowMonitor's loss definition differing from the offered-load model. Fix the cause.

- [ ] **Step 6: Commit**

```bash
git add pipeline/parse.py pipeline/test_parse.py
git commit -m "feat(pipeline): per-run metric extraction with reconciliation assertions"
```

---

### Task 7: Aggregation, derived metrics, and results.json

**Files:**
- Modify: `pipeline/parse.py`
- Modify: `pipeline/test_parse.py`

**Interfaces:**
- Consumes: everything Task 6 produced.
- Produces:
  - `interpolate_max_clients(points: list[tuple[int, float]], threshold: float) -> int | str`
  - `build_results(raw_dir: Path, expected_trials: int) -> dict` matching the TRD section 5 schema
  - `data/results.json`, which Task 8 imports

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/test_parse.py`:

```python
from parse import interpolate_max_clients


def test_interpolation_finds_crossing_between_bracketing_points():
    # Latency crosses 50 ms between 40 clients (30 ms) and 60 clients (70 ms).
    # 40 + (50-30)*(60-40)/(70-30) = 40 + 20*20/40 = 50
    points = [(20, 12.0), (40, 30.0), (60, 70.0), (80, 110.0)]
    assert interpolate_max_clients(points, threshold=50.0) == 50


def test_interpolation_uses_first_crossing_not_last():
    points = [(20, 10.0), (40, 60.0), (60, 40.0), (80, 90.0)]
    # First crossing is between 20 and 40: 20 + (50-10)*20/50 = 36
    assert interpolate_max_clients(points, threshold=50.0) == 36


def test_no_crossing_within_grid_reports_over_200_not_extrapolated():
    points = [(20, 5.0), (60, 9.0), (120, 14.0), (200, 21.0)]
    assert interpolate_max_clients(points, threshold=50.0) == ">200"


def test_threshold_exceeded_at_lowest_density_reports_that_density():
    points = [(20, 80.0), (60, 120.0)]
    assert interpolate_max_clients(points, threshold=50.0) == 20


def test_interpolation_sorts_unordered_points():
    points = [(60, 70.0), (20, 12.0), (40, 30.0)]
    assert interpolate_max_clients(points, threshold=50.0) == 50


def test_interpolation_handles_flat_segment_without_dividing_by_zero():
    # Identical latencies at both ends of the bracket.
    points = [(20, 50.0), (40, 50.0), (60, 90.0)]
    result = interpolate_max_clients(points, threshold=50.0)
    assert result == 20
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd /mnt/f/PROJECTS/AIRTEST/pipeline
python3 -m pytest test_parse.py -v -k interpolat
```

Expected: FAIL with `ImportError: cannot import name 'interpolate_max_clients'`.

- [ ] **Step 3: Implement interpolation and aggregation**

Append to `pipeline/parse.py`:

```python
# Study-defined thresholds. These are parameters of the study, not objective
# facts, and must be reported as such with the sensitivity variants below.
LATENCY_THRESHOLD_MS = 50.0
LATENCY_SENSITIVITY_MS = [30.0, 100.0]
PACKET_LOSS_THRESHOLD_PCT = 5.0

# Metrics carried per trial. Energy efficiency is deliberately absent: it is
# conditional on TWT support (see docs/phase0-verification.md) and is added
# only if that verification came back positive.
TRIAL_METRICS = [
    "aggregate_throughput_mbps",
    "per_user_throughput_mbps",
    "latency_ms",
    "jitter_ms",
    "packet_loss_pct",
    "satisfaction_ratio_pct",
    "fairness_index",
    "airtime_utilization_pct",
]


def interpolate_max_clients(points, threshold):
    """Client count at which mean latency crosses `threshold`.

    Linear interpolation between the two bracketing density points, because
    the true saturation point rarely lands on a simulated density. Returns
    ">200" where no crossing occurs in the grid — never extrapolates.
    """
    pts = sorted(points)
    if not pts:
        return ">200"
    if pts[0][1] >= threshold:
        # Already over threshold at the lowest measured density; the true
        # figure is below the grid, so report the lowest measured point.
        return pts[0][0]

    for (d1, l1), (d2, l2) in zip(pts, pts[1:]):
        if l2 >= threshold > l1:
            if l2 == l1:
                return d1
            crossed = d1 + (threshold - l1) * (d2 - d1) / (l2 - l1)
            return int(round(crossed))
    return ">200"


def _mean_std(values):
    return {
        "mean": round(statistics.mean(values), 3),
        "std": round(statistics.stdev(values), 3) if len(values) > 1 else 0.0,
    }


def build_results(raw_dir, expected_trials=2):
    raw_dir = Path(raw_dir)
    scenarios = {}
    warnings = []

    for xml_path in sorted(raw_dir.glob("*.xml")):
        run_id = xml_path.stem
        try:
            fields = parse_run_id(run_id)
        except ValueError:
            warnings.append(f"skipped unrecognised file: {xml_path.name}")
            continue

        phy_path = raw_dir / f"{run_id}.phy.json"
        if not phy_path.exists():
            warnings.append(f"missing PHY companion for {run_id}")
            continue

        phy = parse_phy(phy_path)
        window = json.loads(phy_path.read_text())["measured_window_s"]
        flow = parse_flowmonitor(xml_path, window)

        offered = offered_load_mbps(fields["traffic_type"], fields["clients"])
        delivered = flow["aggregate_throughput_mbps"]
        check_reconciliation(delivered, flow["packet_loss_pct"], offered)

        fairness = jains_fairness(flow["per_flow_throughput_mbps"])
        assert 0.0 <= fairness <= 1.0, f"fairness out of range for {run_id}"

        trial = {
            "seed": fields["seed"],
            "aggregate_throughput_mbps": delivered,
            "per_user_throughput_mbps": round(delivered / fields["clients"], 4),
            "latency_ms": flow["latency_ms"],
            "jitter_ms": flow["jitter_ms"],
            "packet_loss_pct": flow["packet_loss_pct"],
            "satisfaction_ratio_pct": round(delivered / offered * 100, 2),
            "fairness_index": round(fairness, 4),
            "airtime_utilization_pct": phy["airtime_utilization_pct"],
        }

        key = (fields["topology"], fields["standard"],
               fields["clients"], fields["traffic_type"])
        scenarios.setdefault(key, {
            "topology": fields["topology"],
            "standard": fields["standard"],
            "clients": fields["clients"],
            "traffic_type": fields["traffic_type"],
            "offered_load_mbps": offered,
            "trials": [],
        })["trials"].append(trial)

    scenario_list = []
    for key in sorted(scenarios):
        sc = scenarios[key]
        sc["trials"].sort(key=lambda t: t["seed"])
        n = len(sc["trials"])
        if n < expected_trials:
            # Reported, never silently averaged over a smaller sample.
            warnings.append(
                f"{key}: {n} trial(s), expected {expected_trials}")
        sc["trial_count"] = n
        sc["aggregates"] = {
            m: _mean_std([t[m] for t in sc["trials"]]) for m in TRIAL_METRICS
        }
        scenario_list.append(sc)

    derived = {"max_supported_clients": _derive_max_clients(scenario_list)}

    return {
        "meta": {
            "latency_threshold_ms": LATENCY_THRESHOLD_MS,
            "latency_sensitivity_ms": LATENCY_SENSITIVITY_MS,
            "packet_loss_threshold_pct": PACKET_LOSS_THRESHOLD_PCT,
            "thresholds_are_study_parameters": True,
            "energy_efficiency_included": False,
            "energy_efficiency_note": (
                "Omitted: TWT is not implemented in the NS-3 version used. "
                "See docs/phase0-verification.md."),
            "warnings": warnings,
        },
        "scenarios": scenario_list,
        "derived": derived,
    }


def _derive_max_clients(scenario_list):
    groups = {}
    for sc in scenario_list:
        groups.setdefault(
            (sc["topology"], sc["standard"], sc["traffic_type"]), []
        ).append((sc["clients"], sc["aggregates"]["latency_ms"]["mean"]))

    out = []
    for (topology, standard, traffic), points in sorted(groups.items()):
        entry = {
            "topology": topology,
            "standard": standard,
            "traffic_type": traffic,
            "max_clients": interpolate_max_clients(points, LATENCY_THRESHOLD_MS),
            "threshold_ms": LATENCY_THRESHOLD_MS,
            "sensitivity": {
                str(t): interpolate_max_clients(points, t)
                for t in LATENCY_SENSITIVITY_MS
            },
        }
        out.append(entry)
    return out


if __name__ == "__main__":
    import argparse
    import os

    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=os.path.expanduser("~/wifi-sim/raw"))
    ap.add_argument("--out", default="/mnt/f/PROJECTS/AIRTEST/data/results.json")
    ap.add_argument("--expected-trials", type=int, default=2)
    args = ap.parse_args()

    results = build_results(args.raw, args.expected_trials)
    Path(args.out).write_text(json.dumps(results, indent=2))

    print(f"wrote {args.out}: {len(results['scenarios'])} scenarios")
    for w in results["meta"]["warnings"]:
        print(f"  WARNING: {w}")
    for d in results["derived"]["max_supported_clients"]:
        print(f"  {d['standard']} {d['traffic_type']}: "
              f"max_clients={d['max_clients']}")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
cd /mnt/f/PROJECTS/AIRTEST/pipeline
python3 -m pytest test_parse.py -v
```

Expected: all 18 tests PASS.

- [ ] **Step 5: Generate the first real results.json**

Run:

```bash
cd /mnt/f/PROJECTS/AIRTEST/pipeline
python3 parse.py --raw ~/wifi-sim/raw --out /mnt/f/PROJECTS/AIRTEST/data/results.json --expected-trials 2
python3 -c "
import json
d = json.load(open('/mnt/f/PROJECTS/AIRTEST/data/results.json'))
print('scenarios:', len(d['scenarios']))
for s in d['scenarios']:
    a = s['aggregates']
    print(s['standard'], s['clients'],
          'thr', a['aggregate_throughput_mbps'],
          'lat', a['latency_ms'],
          'sat', a['satisfaction_ratio_pct'])
"
```

Expected: 6 scenarios (2 standards x 3 densities), each with 2 trials and a non-zero standard deviation on at least some metrics — zero std everywhere would mean the Nakagami fading and per-trial run numbers are not producing variation, which must be fixed.

Satisfaction ratio should fall as client count rises. If it does not, the densities are not yet reaching congestion and the eventual full grid may need higher values.

- [ ] **Step 6: Reconcile the TWT flag with reality**

If `docs/phase0-verification.md` recorded TWT as **present**, change `energy_efficiency_included` to `True` in `build_results` and add the metric. If it recorded TWT as **absent** (the expected outcome for NS-3 3.42), leave the flag `False` and confirm the note text matches what the verification document actually says. The two documents must not disagree.

- [ ] **Step 7: Commit**

```bash
git add pipeline/parse.py pipeline/test_parse.py data/results.json
git commit -m "feat(pipeline): aggregation, interpolated max supported clients, results.json"
```

---

### Task 8: Dashboard with comparison chart

**Files:**
- Create: `dashboard/` (Vite scaffold)
- Create: `dashboard/src/App.jsx`
- Create: `dashboard/src/ComparisonChart.jsx`
- Create: `dashboard/src/metrics.js`

**Interfaces:**
- Consumes: `data/results.json` from Task 7.
- Produces: a running dev server rendering WiFi 5 vs WiFi 6 across density for a selectable metric. `RadarView`, `SummaryTable`, and `SampleRun` are deliberately out of scope until the dataset is wide enough to make them meaningful.

- [ ] **Step 1: Scaffold the Vite app and install dependencies**

Run, from Windows PowerShell in the repo root:

```bash
npm create vite@latest dashboard -- --template react
cd dashboard
npm install
npm install recharts
```

- [ ] **Step 2: Make results.json importable**

Run:

```bash
cd F:\PROJECTS\AIRTEST\dashboard
mkdir src\data
copy ..\data\results.json src\data\results.json
```

The JSON is a few hundred KB, so it is imported into the bundle rather than fetched — no loading state, no fetch error handling, nothing to get wrong at runtime.

Add to `dashboard/package.json` under `"scripts"`, so the copy is never forgotten:

```json
    "sync-data": "node -e \"require('fs').copyFileSync('../data/results.json','src/data/results.json')\"",
```

- [ ] **Step 3: Write the metric definitions**

Create `dashboard/src/metrics.js`:

```javascript
// Every metric carries its unit and its direction, so charts can always be
// labelled correctly and "higher is better" is never assumed.
export const METRICS = [
  { key: 'aggregate_throughput_mbps', label: 'Aggregate throughput', unit: 'Mbps', betterWhen: 'higher' },
  { key: 'per_user_throughput_mbps', label: 'Per-user throughput', unit: 'Mbps', betterWhen: 'higher' },
  { key: 'latency_ms', label: 'Latency', unit: 'ms', betterWhen: 'lower' },
  { key: 'jitter_ms', label: 'Jitter', unit: 'ms', betterWhen: 'lower' },
  { key: 'packet_loss_pct', label: 'Packet loss', unit: '%', betterWhen: 'lower' },
  { key: 'satisfaction_ratio_pct', label: 'Offered-load satisfaction', unit: '%', betterWhen: 'higher' },
  { key: 'fairness_index', label: "Jain's fairness index", unit: '0-1', betterWhen: 'higher' },
  { key: 'airtime_utilization_pct', label: 'Airtime utilization', unit: '%', betterWhen: 'higher' },
];

export const STANDARD_LABELS = {
  wifi5: 'WiFi 5 (802.11ac)',
  wifi6: 'WiFi 6 (802.11ax)',
};

/**
 * Reshape scenarios into one row per client density, with a mean and a
 * [low, high] std-dev band per standard, which is the shape Recharts's
 * Area-based error band needs.
 */
export function toChartRows(scenarios, { topology, trafficType, metricKey }) {
  const matching = scenarios.filter(
    (s) => s.topology === topology && s.traffic_type === trafficType
  );

  const byDensity = new Map();
  for (const s of matching) {
    const agg = s.aggregates[metricKey];
    if (!agg) continue;
    const row = byDensity.get(s.clients) ?? { clients: s.clients };
    row[`${s.standard}_mean`] = agg.mean;
    row[`${s.standard}_band`] = [
      Number((agg.mean - agg.std).toFixed(3)),
      Number((agg.mean + agg.std).toFixed(3)),
    ];
    byDensity.set(s.clients, row);
  }

  return [...byDensity.values()].sort((a, b) => a.clients - b.clients);
}
```

- [ ] **Step 4: Write the comparison chart**

Create `dashboard/src/ComparisonChart.jsx`:

```jsx
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STANDARD_LABELS, toChartRows } from './metrics';

export default function ComparisonChart({
  scenarios,
  topology,
  trafficType,
  metric,
}) {
  const rows = toChartRows(scenarios, {
    topology,
    trafficType,
    metricKey: metric.key,
  });

  if (rows.length === 0) {
    return <p>No data for this filter combination.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={420}>
      <ComposedChart data={rows} margin={{ top: 16, right: 24, bottom: 48, left: 56 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="clients"
          type="number"
          domain={['dataMin', 'dataMax']}
          label={{ value: 'Client density (stations)', position: 'insideBottom', offset: -24 }}
        />
        <YAxis
          label={{
            value: `${metric.label} (${metric.unit})`,
            angle: -90,
            position: 'insideLeft',
            offset: -12,
            style: { textAnchor: 'middle' },
          }}
        />
        <Tooltip
          formatter={(value, name) =>
            Array.isArray(value)
              ? [`${value[0]} - ${value[1]} ${metric.unit}`, `${name} (±1 SD)`]
              : [`${value} ${metric.unit}`, name]
          }
          labelFormatter={(v) => `${v} clients`}
        />
        <Legend verticalAlign="top" height={36} />

        <Area
          dataKey="wifi5_band"
          name={`${STANDARD_LABELS.wifi5} ±1 SD`}
          stroke="none"
          fill="#1f77b4"
          fillOpacity={0.15}
        />
        <Area
          dataKey="wifi6_band"
          name={`${STANDARD_LABELS.wifi6} ±1 SD`}
          stroke="none"
          fill="#d62728"
          fillOpacity={0.15}
        />
        <Line
          dataKey="wifi5_mean"
          name={STANDARD_LABELS.wifi5}
          stroke="#1f77b4"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
        <Line
          dataKey="wifi6_mean"
          name={STANDARD_LABELS.wifi6}
          stroke="#d62728"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

The two `Area` series render before the two `Line` series so the shaded standard-deviation bands sit behind the means rather than washing them out.

- [ ] **Step 5: Write the app shell**

Create `dashboard/src/App.jsx`:

```jsx
import { useState } from 'react';
import results from './data/results.json';
import ComparisonChart from './ComparisonChart';
import { METRICS } from './metrics';

export default function App() {
  const [metricKey, setMetricKey] = useState(METRICS[0].key);
  const metric = METRICS.find((m) => m.key === metricKey);

  const topologies = [...new Set(results.scenarios.map((s) => s.topology))];
  const trafficTypes = [...new Set(results.scenarios.map((s) => s.traffic_type))];
  const [topology, setTopology] = useState(topologies[0]);
  const [trafficType, setTrafficType] = useState(trafficTypes[0]);

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>WiFi 5 vs WiFi 6 in dense lecture theatres</h1>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
        <label>
          Metric{' '}
          <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
        <label>
          Topology{' '}
          <select value={topology} onChange={(e) => setTopology(e.target.value)}>
            {topologies.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          Traffic{' '}
          <select value={trafficType} onChange={(e) => setTrafficType(e.target.value)}>
            {trafficTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <p style={{ color: '#555' }}>
        {metric.label} ({metric.unit}) —{' '}
        {metric.betterWhen === 'higher' ? 'higher is better' : 'lower is better'}.{' '}
        Shaded bands show ±1 standard deviation across trials.
      </p>

      <ComparisonChart
        scenarios={results.scenarios}
        topology={topology}
        trafficType={trafficType}
        metric={metric}
      />

      {results.meta.warnings.length > 0 && (
        <section style={{ marginTop: '2rem', padding: '1rem', background: '#fff8e1' }}>
          <strong>Dataset warnings</strong>
          <ul>
            {results.meta.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
```

The direction caption reads from `metric.betterWhen` rather than being hardcoded, because half these metrics are better low (latency, jitter, loss) and half better high (throughput, fairness, satisfaction). A fixed caption would be false under half the charts.

- [ ] **Step 6: Run the dev server and verify**

Run:

```bash
cd F:\PROJECTS\AIRTEST\dashboard
npm run dev
```

Expected: the server starts; opening the printed URL shows the chart with two labelled lines across the three densities, shaded ±1 SD bands, axis labels carrying units, and a working metric selector. Switch to "Latency" and confirm both the axis label and unit update.

If the page is blank, check the browser console. The most likely cause is `src/data/results.json` not having been copied in Step 2 — run `npm run sync-data`.

- [ ] **Step 7: Commit**

```bash
git add dashboard/
git commit -m "feat(dashboard): comparison chart over real slice data"
```

---

## Slice complete

At this point one path runs end to end on real data: NS-3 produces both artifacts, the runner survives interruption, the parser asserts its own consistency, and the dashboard renders it. Every seam named in the spec has been exercised.

The next plan widens the matrix: traffic types (web, bulk), then the full density grid, then trials to 8, then the multi-AP topology with BSS coloring — followed by `RadarView`, `SummaryTable`, `SampleRun`, and deployment.

The run-time extrapolation printed in Task 5 Step 2 decides whether the full 528-run matrix is affordable as specified or needs the TRD's documented reductions.
