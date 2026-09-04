#!/usr/bin/env python3
"""Turn NS-3 raw output into per-run metrics and an aggregated results.json."""
import json
import re
import statistics
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
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


def parse_series(path, payload_bytes, clients):
    """Turn a run's cumulative time-series counters into per-interval metrics.

    The scenario deliberately records only cumulative counters, so every
    derived metric is computed here — by the same arithmetic that produces the
    trial aggregates. A series and its own summary can then never disagree
    about what "goodput" or "loss" means, which duplicating the formulas in
    C++ would have invited.

    Intervals with non-positive width are skipped rather than divided by: a
    sticky-precision bug in the emitter once collapsed every timestamp to its
    integer second, and a silent ZeroDivisionError is a worse failure than a
    short series.
    """
    raw = json.loads(Path(path).read_text())
    samples = raw.get("samples", [])
    out = []

    for a, b in zip(samples, samples[1:]):
        dt = b["t"] - a["t"]
        if dt <= 0:
            continue

        d_rx = b["rxPackets"] - a["rxPackets"]
        d_tx = b["txPackets"] - a["txPackets"]
        d_delay_ns = b["delaySumNs"] - a["delaySumNs"]
        d_busy = b["airtimeBusySec"] - a["airtimeBusySec"]

        goodput = d_rx * payload_bytes * 8 / dt / 1e6
        loss = ((d_tx - d_rx) / d_tx * 100) if d_tx > 0 else 0.0
        latency = (d_delay_ns / d_rx / 1e6) if d_rx > 0 else 0.0
        airtime = d_busy / dt * 100

        out.append({
            "t": round(b["t"], 3),
            "aggregate_throughput_mbps": round(goodput, 3),
            "per_user_throughput_mbps": round(goodput / clients, 4) if clients else 0.0,
            # Clamp only the reporting range, never the value's sign: a
            # negative loss would mean the counters went backwards, which is a
            # bug to surface rather than hide.
            "packet_loss_pct": round(max(loss, 0.0), 3),
            "latency_ms": round(latency, 3),
            "airtime_utilization_pct": round(min(airtime, 100.0), 2),
        })

    return out


def _payload_mbps(flow, rx_packets, payload_bytes, header_bytes, window_s):
    """Application-layer goodput for one flow.

    With header_bytes known, payload comes from rxBytes minus the per-packet
    transport+IP header, which is exact. TCP segments are not all full, so the
    older rx_packets * payload_bytes shortcut over-reports a rate-limited bulk
    stream; it stays as the fallback for data recorded before the scenario
    emitted header_bytes.
    """
    if header_bytes is not None:
        rx_bytes = int(flow.get("rxBytes", 0))
        payload = max(rx_bytes - rx_packets * header_bytes, 0)
        return payload * 8 / window_s / 1e6
    return rx_packets * payload_bytes * 8 / window_s / 1e6


def downlink_flow_ids(root, app_port_base, app_port_count):
    """Flow ids of the AP-to-client application flows.

    TCP is bidirectional, so a bulk run opens a reverse ACK flow per client
    and FlowMonitor reports each as its own <Flow>. Summing every flow counted
    those ACKs as payload: a 10-client bulk run reported 20 flows and 431% of
    offered load.

    The Ipv4FlowClassifier maps each flow id to its addresses and ports, so a
    downlink data flow is identified by its DESTINATION port sitting in the
    application range. That range is BOUNDED AT BOTH ENDS: the reply flow's
    destination is the client's ephemeral port, which is numerically higher
    than the app base, so a lower bound alone still keeps every ACK flow.

    Returns None when there is no classifier or no known port count, meaning
    "no filter" — a UDP run is unidirectional and needs none, and data
    recorded before the scenario emitted port metadata must still parse.
    """
    classifier = root.find("Ipv4FlowClassifier")
    if classifier is None or not app_port_count:
        return None

    lo, hi = app_port_base, app_port_base + app_port_count

    ids = set()
    for flow in classifier.iter("Flow"):
        try:
            dport = int(flow.get("destinationPort"))
            fid = int(flow.get("flowId"))
        except (TypeError, ValueError):
            continue
        if lo <= dport < hi:
            ids.add(fid)
    return ids or None


def parse_flowmonitor(path, window_s, payload_bytes, app_port_base=5000,
                      app_port_count=None, header_bytes=None):
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

    Loss is computed as txPackets - rxPackets, not the <Flow> element's
    lostPackets attribute. FlowMonitor only increments lostPackets when it
    detects a gap in received sequence numbers (i.e. a later packet arrives
    proving an earlier one was skipped); a packet that is simply never
    delivered by the end of the measurement window -- dropped in the queue,
    or still in flight -- leaves no later packet to reveal the gap, so it is
    silently absent from both rxPackets and lostPackets. Observed on real
    NS-3 output: flowId 3 of single_ap_wifi5_video_c10_s1 has txPackets=937,
    rxPackets=627, lostPackets=0 -- 310 packets genuinely undelivered but
    unreported by lostPackets.
    """
    root = ET.parse(path).getroot()
    flow_stats = root.find("FlowStats")
    if flow_stats is None:
        raise ValueError(f"no FlowStats element in {path}")

    keep = downlink_flow_ids(root, app_port_base, app_port_count)

    per_flow_mbps = []
    total_tx_packets = 0
    delay_ms_weighted = 0.0
    jitter_ms_weighted = 0.0
    total_rx_packets = 0
    flows_with_rx = 0

    for flow in flow_stats.iter("Flow"):
        rx_packets = int(flow.get("rxPackets"))
        tx_packets = int(flow.get("txPackets"))

        # Ignore control/ARP flows that carried no application payload.
        if tx_packets == 0:
            continue

        # Drop the reverse ACK flows a TCP run opens.
        if keep is not None and int(flow.get("flowId")) not in keep:
            continue

        per_flow_mbps.append(
            _payload_mbps(flow, rx_packets, payload_bytes, header_bytes, window_s))
        total_tx_packets += tx_packets
        total_rx_packets += rx_packets

        if rx_packets > 0:
            delay_ms_weighted += _ns_to_ms(flow.get("delaySum"))
            jitter_ms_weighted += _ns_to_ms(flow.get("jitterSum"))
            flows_with_rx += 1

    aggregate_mbps = sum(per_flow_mbps)
    loss_pct = ((total_tx_packets - total_rx_packets) / total_tx_packets * 100
                if total_tx_packets else 0.0)
    latency_ms = (delay_ms_weighted / total_rx_packets
                  if total_rx_packets else 0.0)
    # jitterSum holds rx-1 terms per flow: flow-monitor.cc accumulates it only
    # when stats.rxPackets > 0, i.e. from the second received packet onward.
    jitter_samples = total_rx_packets - flows_with_rx
    jitter_ms = jitter_ms_weighted / jitter_samples if jitter_samples > 0 else 0.0

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
CAVEATS = [
    "packet_loss_pct is inflated by the short measurement window: packets "
    "still queued or in flight when the window closes are counted as lost, "
    "and that roughly fixed backlog is divided by a short window.",
    "That inflation grows with client density, because queues are deeper at "
    "high density, so the loss curve is steeper than a steady-state run would "
    "show.",
    "latency_ms and jitter_ms are conditioned on delivery: they are computed "
    "over received packets only. Packets that were never delivered — which "
    "would have been the slowest — contribute nothing, so both metrics "
    "understate delay wherever loss is non-trivial.",
]

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
    """Client count at which the mean metric crosses `threshold`.

    Linear interpolation between the two bracketing density points, because
    the true saturation point rarely lands on a simulated density. Where no
    crossing occurs, returns ">N" for the LARGEST density actually measured
    — never extrapolates beyond the grid, and never names a density that was
    not simulated. Returns None when there are no measured points at all.
    """
    pts = sorted(points)
    if not pts:
        return None
    if pts[0][1] >= threshold:
        # Already over threshold at the lowest measured density; the true
        # figure is below the grid, so report the lowest measured point.
        return pts[0][0]

    for (d1, l1), (d2, l2) in zip(pts, pts[1:]):
        if l2 >= threshold > l1:
            # l1 < threshold <= l2 forces l1 < l2, so this cannot divide by zero.
            crossed = d1 + (threshold - l1) * (d2 - d1) / (l2 - l1)
            return int(round(crossed))
    return f">{pts[-1][0]}"


def _mean_std(values):
    return {
        "mean": round(statistics.mean(values), 3),
        "std": round(statistics.stdev(values), 3) if len(values) > 1 else 0.0,
    }


def build_results(raw_dir, expected_trials=2):
    raw_dir = Path(raw_dir)
    scenarios = {}
    warnings = []
    windows = set()
    payloads = set()

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

        series_path = raw_dir / f"{run_id}.series.json"

        phy = parse_phy(phy_path)
        meta = parse_meta(meta_path)
        window = meta["measurementWindowSec"]
        payload_bytes = meta["payloadBytes"]
        windows.add(window)
        payloads.add(payload_bytes)
        flow = parse_flowmonitor(xml_path, window, payload_bytes,
                                 app_port_base=meta.get("appPortBase", 5000),
                                 app_port_count=meta.get("clients"),
                                 header_bytes=meta.get("headerBytes"))

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

        # The replay's needles are driven by this. A run without one still
        # yields a valid trial — it simply cannot be replayed — so record the
        # gap rather than dropping the whole run.
        if series_path.exists():
            trial["series"] = parse_series(series_path, payload_bytes,
                                           fields["clients"])
        else:
            warnings.append(f"no time series for {run_id}; not replayable")

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

    derived = {
        "max_supported_clients": _derive_max_clients(scenario_list),
        "max_supported_clients_by_loss": _derive_max_clients_by_loss(scenario_list),
    }

    if len(windows) > 1:
        warnings.append(
            f"runs disagree on measurement window: {sorted(windows)} s; "
            "metrics normalised per-run but not comparable across windows")
    if len(payloads) > 1:
        warnings.append(f"runs disagree on payload size: {sorted(payloads)} bytes")

    return {
        "meta": {
            "ns3_version": "3.42",
            "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "measurement_window_s": (sorted(windows) if len(windows) > 1
                                     else next(iter(windows), None)),
            "payload_bytes": (sorted(payloads) if len(payloads) > 1
                              else next(iter(payloads), None)),
            "offered_load_definition": (
                "Application-layer offered load: payload bytes generated by the "
                "client applications, excluding IP/UDP/MAC headers and "
                "retransmissions."),
            "latency_threshold_ms": LATENCY_THRESHOLD_MS,
            "latency_sensitivity_ms": LATENCY_SENSITIVITY_MS,
            "packet_loss_threshold_pct": PACKET_LOSS_THRESHOLD_PCT,
            "thresholds_are_study_parameters": True,
            "caveats": CAVEATS,
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


def _derive_max_clients_by_loss(scenario_list):
    """Same derivation as _derive_max_clients, but on mean packet_loss_pct.

    Reported separately from the latency figure, never merged with it: the
    two thresholds are independent study parameters and can disagree.
    """
    groups = {}
    for sc in scenario_list:
        groups.setdefault(
            (sc["topology"], sc["standard"], sc["traffic_type"]), []
        ).append((sc["clients"], sc["aggregates"]["packet_loss_pct"]["mean"]))

    return [
        {
            "topology": topology,
            "standard": standard,
            "traffic_type": traffic,
            "max_clients": interpolate_max_clients(
                points, PACKET_LOSS_THRESHOLD_PCT),
            "threshold_pct": PACKET_LOSS_THRESHOLD_PCT,
        }
        for (topology, standard, traffic), points in sorted(groups.items())
    ]


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
