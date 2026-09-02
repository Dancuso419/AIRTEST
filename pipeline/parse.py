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


def parse_meta(path):
    """Load the per-run <run_id>.meta.json (measurement window, payload size, ...)."""
    return json.loads(Path(path).read_text())


def parse_flowmonitor(path, window_s, payload_bytes):
    """Extract aggregate and per-flow metrics from FlowMonitor XML.

    FlowMonitor's top level has four children: FlowStats, Ipv4FlowClassifier,
    Ipv6FlowClassifier, FlowProbes. <Flow> elements appear under BOTH
    FlowStats (real per-flow counters) and Ipv4FlowClassifier (flow-id ->
    address/port mapping, no counters at all). Only FlowStats/Flow carries
    txPackets/rxPackets/etc, so we must iterate that subtree specifically --
    root.iter("Flow") silently picks up the classifier entries too and blows
    up on their missing attributes.

    Throughput is reported as application-layer goodput (rx_packets *
    payload_bytes), not FlowMonitor's rxBytes, which includes IP/UDP headers
    and would make satisfaction_ratio_pct structurally exceed 100%.

    FlowMonitor reports delaySum and jitterSum as NS-3 time strings such as
    '+1234567ns'; they are converted to milliseconds per received packet.
    """
    root = ET.parse(path).getroot()
    flow_stats = root.find("FlowStats")
    if flow_stats is None:
        raise ValueError(f"no FlowStats element in {path}")

    per_flow_mbps = []
    total_tx_packets = 0
    total_lost_packets = 0
    delay_ms_weighted = 0.0
    jitter_ms_weighted = 0.0
    total_rx_packets = 0

    for flow in flow_stats.iter("Flow"):
        rx_packets = int(flow.get("rxPackets"))
        tx_packets = int(flow.get("txPackets"))
        lost = int(flow.get("lostPackets"))

        # Ignore control/ARP flows that carried no application payload.
        if tx_packets == 0:
            continue

        per_flow_mbps.append(rx_packets * payload_bytes * 8 / window_s / 1e6)
        total_tx_packets += tx_packets
        total_lost_packets += lost
        total_rx_packets += rx_packets

        if rx_packets > 0:
            delay_ms_weighted += _ns_to_ms(flow.get("delaySum"))
            jitter_ms_weighted += _ns_to_ms(flow.get("jitterSum"))

    aggregate_mbps = total_rx_packets * payload_bytes * 8 / window_s / 1e6
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
            # l1 < threshold <= l2 forces l1 < l2, so this cannot divide by zero.
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

        meta_path = raw_dir / f"{run_id}.meta.json"
        if not meta_path.exists():
            warnings.append(f"missing meta companion for {run_id}")
            continue

        phy = parse_phy(phy_path)
        meta = parse_meta(meta_path)
        window = meta["measurementWindowSec"]
        payload_bytes = meta["payloadBytes"]
        flow = parse_flowmonitor(xml_path, window, payload_bytes)

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
