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
