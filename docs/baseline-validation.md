# Baseline Validation

Purpose: confirm the NS-3 PHY/MAC configuration is correct before running the
full matrix. Low-density runs must deliver approximately their full offered
load; failure here invalidates every later result.

Configuration: **SpectrumWifiPhyHelper with MultiModelSpectrumChannel** (not
Yans — OFDMA on 802.11ax delivered zero packets under Yans, so both standards
now use Spectrum), 80 MHz, 5 GHz, single spatial stream, IdealWifiManager,
log-distance (exponent 3.0) plus Nakagami fading. Each run is `--duration=5`
(5 s simulated); traffic starts at t=2.0 s, so `Simulator::Stop` at exactly
`duration` gives a 3 s measurement window shared by traffic, FlowMonitor and
the PHY state counters. **Throughput reported below is application-layer
goodput** (`rxPackets * payloadBytes(1200) * 8 / measurementWindowSec`, both
values read from each run's `.meta.json`), not FlowMonitor's `rxBytes` (which
includes 20 B IP + 8 B UDP overhead per packet and would inflate the ratio
past 100%).

Note: the task instructions requested "twelve runs"; the concrete run list
given (1/3/5 clients x wifi5/wifi6, seed=1, duration=5) is six distinct
simulation runs, each producing an `.xml`, `.meta.json` and `.phy.json` (18
files total, or 12 if counting only xml+meta). All six specified runs were
executed; results below cover all six.

| Standard | Clients | Offered (Mbps) | Delivered goodput (Mbps) | Ratio | Tx pkts | Rx pkts | Lost pkts | Loss % |
|---|---|---|---|---|---|---|---|---|
| wifi5 | 1 | 3.0 | 2.998 | 99.9% | 937 | 937 | 0 | 0.00% |
| wifi5 | 3 | 9.0 | 8.995 | 99.9% | 2811 | 2811 | 0 | 0.00% |
| wifi5 | 5 | 15.0 | 14.992 | 99.9% | 4685 | 4685 | 0 | 0.00% |
| wifi6 | 1 | 3.0 | 2.998 | 99.9% | 937 | 937 | 0 | 0.00% |
| wifi6 | 3 | 9.0 | 8.995 | 99.9% | 2811 | 2811 | 0 | 0.00% |
| wifi6 | 5 | 15.0 | 14.992 | 99.9% | 4685 | 4685 | 0 | 0.00% |

The residual 0.1% gap (99.9% instead of 100%) is consistent with normal
edge effects (packets in flight at the measurement window boundary), not
loss — `lostPackets` is zero and `txPackets == rxPackets` in every run.

## Theoretical reference

Measured on this exact build (`ns-3.42`, `wifi-he-network` example, same
Spectrum PHY / channel stack used by the scenario):

- 802.11ax, MCS 9, 80 MHz, 800 ns GI: **346.466 Mbit/s**
- 802.11ax, MCS 8, 80 MHz, 800 ns GI: **317.167 Mbit/s**
- 802.11ax, MCS 9, 160 MHz, 1600 ns GI: **511.65 Mbit/s**

These measured-on-this-build figures are stronger evidence for this
configuration than published ceilings, and are cited as the primary
reference. As secondary textbook context only:

802.11ac, 80 MHz, 1 spatial stream: ~433 Mbps PHY, ~260-300 Mbps achievable MAC.
802.11ax, 80 MHz, 1 spatial stream: ~600 Mbps PHY, ~380-420 Mbps achievable MAC.

Offered loads of 3-15 Mbps in this baseline are two orders of magnitude
below both the measured-on-this-build ceilings and the textbook ceilings, so
near-full delivery is the expected result and is what validates the
configuration.

## Verdict

**PASS** — every one of the six low-density runs (both standards, 1/3/5
clients, offered loads 3/9/15 Mbps) delivered 99.9% of offered load as
application-layer goodput with zero lost packets and tx == rx packet
counts. The PHY/MAC configuration (Spectrum PHY, ChannelSettings,
IdealWifiManager rate adaptation, propagation model) is confirmed correct
for both 802.11ac and 802.11ax before proceeding to the full simulation
matrix. No changes were required to the scenario.
