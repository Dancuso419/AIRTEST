import json
import math
import pytest
from parse import (
    ReconciliationError,
    check_reconciliation,
    jains_fairness,
    offered_load_mbps,
    parse_flowmonitor,
    parse_meta,
    parse_run_id,
    parse_series,
)


FLOWMONITOR_XML = """<?xml version="1.0" ?>
<FlowMonitor>
  <FlowStats>
    <Flow flowId="1" timeFirstTxPacket="+0.0ns" timeFirstRxPacket="+0.0ns"
          timeLastTxPacket="+0.0ns" timeLastRxPacket="+0.0ns"
          delaySum="+2000000.0ns" jitterSum="+500000.0ns" lastDelay="+0.0ns"
          txBytes="122800" rxBytes="122800" txPackets="100" rxPackets="100"
          lostPackets="0" timesForwarded="0" />
    <Flow flowId="2" timeFirstTxPacket="+0.0ns" timeFirstRxPacket="+0.0ns"
          timeLastTxPacket="+0.0ns" timeLastRxPacket="+0.0ns"
          delaySum="+1000000.0ns" jitterSum="+250000.0ns" lastDelay="+0.0ns"
          txBytes="61400" rxBytes="49120" txPackets="50" rxPackets="40"
          lostPackets="10" timesForwarded="0" />
  </FlowStats>
  <Ipv4FlowClassifier>
    <Flow flowId="1" sourceAddress="10.0.0.1" destinationAddress="10.0.0.2"
          sourcePort="49153" destinationPort="9" protocol="17" />
    <Flow flowId="2" sourceAddress="10.0.0.3" destinationAddress="10.0.0.2"
          sourcePort="49154" destinationPort="9" protocol="17" />
  </Ipv4FlowClassifier>
  <Ipv6FlowClassifier />
  <FlowProbes />
</FlowMonitor>
"""

FLOWMONITOR_XML_NO_STATS = """<?xml version="1.0" ?>
<FlowMonitor>
  <Ipv4FlowClassifier>
    <Flow flowId="1" sourceAddress="10.0.0.1" destinationAddress="10.0.0.2"
          sourcePort="49153" destinationPort="9" protocol="17" />
  </Ipv4FlowClassifier>
</FlowMonitor>
"""


def test_flowstats_flows_counted_classifier_flows_ignored(tmp_path):
    xml_path = tmp_path / "run.xml"
    xml_path.write_text(FLOWMONITOR_XML)

    result = parse_flowmonitor(xml_path, window_s=3.0, payload_bytes=1200)

    # Two real flows from FlowStats, not four (classifier duplicates ignored)
    # and no TypeError from the classifier's missing counter attributes.
    assert len(result["per_flow_throughput_mbps"]) == 2


def test_loss_counts_undelivered_packets_even_when_lostpackets_attr_is_zero(tmp_path):
    # Real NS-3 output: a packet dropped/still-in-flight at the end of the
    # measurement window leaves lostPackets=0 (no later packet revealed the
    # sequence gap) even though txPackets > rxPackets. Loss must come from
    # tx - rx, not the lostPackets attribute.
    xml = """<?xml version="1.0" ?>
<FlowMonitor>
  <FlowStats>
    <Flow flowId="1" timeFirstTxPacket="+0.0ns" timeFirstRxPacket="+0.0ns"
          timeLastTxPacket="+0.0ns" timeLastRxPacket="+0.0ns"
          delaySum="+0.0ns" jitterSum="+0.0ns" lastDelay="+0.0ns"
          txBytes="1150636" rxBytes="769956" txPackets="937" rxPackets="627"
          lostPackets="0" timesForwarded="0" />
  </FlowStats>
</FlowMonitor>
"""
    xml_path = tmp_path / "run.xml"
    xml_path.write_text(xml)

    result = parse_flowmonitor(xml_path, window_s=3.0, payload_bytes=1200)

    assert result["packet_loss_pct"] == round((937 - 627) / 937 * 100, 3)


def test_goodput_uses_rx_packets_times_payload_not_rx_bytes(tmp_path):
    xml_path = tmp_path / "run.xml"
    xml_path.write_text(FLOWMONITOR_XML)

    result = parse_flowmonitor(xml_path, window_s=3.0, payload_bytes=1200)

    # flow 1: 100 rxPackets, rxBytes=122800 (1228 B/pkt with IP+UDP headers)
    # goodput must come from 100 * 1200 * 8 / 3 / 1e6, NOT 122800 * 8 / 3 / 1e6
    goodput_correct = 100 * 1200 * 8 / 3.0 / 1e6
    goodput_from_rxbytes = 122800 * 8 / 3.0 / 1e6
    assert goodput_correct != pytest.approx(goodput_from_rxbytes)
    assert result["per_flow_throughput_mbps"][0] == pytest.approx(
        goodput_correct, rel=1e-3)

    total_rx_packets = 100 + 40
    expected_aggregate = total_rx_packets * 1200 * 8 / 3.0 / 1e6
    assert result["aggregate_throughput_mbps"] == pytest.approx(
        expected_aggregate, rel=1e-3)


def test_missing_flowstats_element_reports_cleanly(tmp_path):
    xml_path = tmp_path / "run.xml"
    xml_path.write_text(FLOWMONITOR_XML_NO_STATS)

    with pytest.raises(ValueError):
        parse_flowmonitor(xml_path, window_s=3.0, payload_bytes=1200)


def test_parse_meta_returns_expected_fields(tmp_path):
    meta_path = tmp_path / "run.meta.json"
    meta_path.write_text(json.dumps({
        "standard": "wifi6", "clients": 10, "appStartSec": 2,
        "appStopSec": 5, "measurementWindowSec": 3,
        "offeredLoadMbps": 30, "payloadBytes": 1200,
    }))

    meta = parse_meta(meta_path)

    assert meta["standard"] == "wifi6"
    assert meta["clients"] == 10
    assert meta["measurementWindowSec"] == 3
    assert meta["payloadBytes"] == 1200


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


def test_no_crossing_reports_largest_measured_density_not_extrapolated():
    points = [(20, 5.0), (60, 9.0), (120, 14.0), (200, 21.0)]
    assert interpolate_max_clients(points, threshold=50.0) == ">200"


def test_no_crossing_on_a_short_grid_reports_that_grids_top_not_200():
    # The regression guard for the fabricated ">200": this grid stops at 20,
    # so nothing above 20 clients was measured and nothing above 20 may be
    # claimed. A hardcoded ">200" fails here.
    points = [(10, 3.0), (14, 4.0), (20, 6.0)]
    assert interpolate_max_clients(points, threshold=50.0) == ">20"
    assert interpolate_max_clients([(30, 1.0), (60, 2.0)], threshold=50.0) == ">60"


def test_no_measured_points_claims_nothing():
    assert interpolate_max_clients([], threshold=50.0) is None


def test_threshold_exceeded_at_lowest_density_reports_that_density():
    points = [(20, 80.0), (60, 120.0)]
    assert interpolate_max_clients(points, threshold=50.0) == 20


def test_interpolation_sorts_unordered_points():
    points = [(60, 70.0), (20, 12.0), (40, 30.0)]
    assert interpolate_max_clients(points, threshold=50.0) == 50


def test_threshold_met_exactly_at_lowest_density_returns_that_density():
    # Identical latencies at both ends of the bracket.
    points = [(20, 50.0), (40, 50.0), (60, 90.0)]
    result = interpolate_max_clients(points, threshold=50.0)
    assert result == 20


# jitterSum holds rx-1 terms per flow (flow-monitor.cc accumulates only when
# stats.rxPackets > 0), so the denominator is rx minus the number of flows
# that received anything. With few packets per flow the two differ sharply.
FLOWMONITOR_XML_SPARSE_JITTER = """<?xml version="1.0" ?>
<FlowMonitor>
  <FlowStats>
    <Flow flowId="1" delaySum="+4000000.0ns" jitterSum="+3000000.0ns"
          txBytes="4800" rxBytes="4800" txPackets="4" rxPackets="4"
          lostPackets="0" />
    <Flow flowId="2" delaySum="+2000000.0ns" jitterSum="+1000000.0ns"
          txBytes="2400" rxBytes="2400" txPackets="2" rxPackets="2"
          lostPackets="0" />
  </FlowStats>
</FlowMonitor>
"""


def test_jitter_divides_by_rx_minus_flows_not_by_rx(tmp_path):
    xml_path = tmp_path / "run.xml"
    xml_path.write_text(FLOWMONITOR_XML_SPARSE_JITTER)

    result = parse_flowmonitor(xml_path, window_s=3.0, payload_bytes=1200)

    # 4 ms of jitter over 6 rx packets from 2 flows => 6 - 2 = 4 samples.
    assert result["jitter_ms"] == pytest.approx(1.0)
    # The wrong denominator (rx = 6) would have given 0.667.
    assert result["jitter_ms"] != pytest.approx(4.0 / 6, abs=1e-3)


FLOWMONITOR_XML_SINGLE_PACKET = """<?xml version="1.0" ?>
<FlowMonitor>
  <FlowStats>
    <Flow flowId="1" delaySum="+1000000.0ns" jitterSum="+0.0ns"
          txBytes="1200" rxBytes="1200" txPackets="1" rxPackets="1"
          lostPackets="0" />
  </FlowStats>
</FlowMonitor>
"""


def test_jitter_is_zero_when_no_flow_has_a_second_packet(tmp_path):
    # rx - flows == 0: no jitter sample exists. Must not divide by zero.
    xml_path = tmp_path / "run.xml"
    xml_path.write_text(FLOWMONITOR_XML_SINGLE_PACKET)

    assert parse_flowmonitor(xml_path, window_s=3.0,
                             payload_bytes=1200)["jitter_ms"] == 0.0


from parse import _derive_max_clients_by_loss


def test_loss_derivation_uses_the_published_five_percent_threshold():
    scenarios = [
        {"topology": "single_ap", "standard": "wifi5", "traffic_type": "video",
         "clients": c, "aggregates": {"packet_loss_pct": {"mean": loss}}}
        for c, loss in [(10, 1.0), (20, 3.0), (40, 7.0)]
    ]
    entry = _derive_max_clients_by_loss(scenarios)[0]
    # Crosses 5% between 20 (3%) and 40 (7%): 20 + (5-3)*20/4 = 30
    assert entry["max_clients"] == 30
    assert entry["threshold_pct"] == 5.0


def test_loss_derivation_never_claims_beyond_the_measured_grid():
    scenarios = [
        {"topology": "single_ap", "standard": "wifi6", "traffic_type": "video",
         "clients": c, "aggregates": {"packet_loss_pct": {"mean": loss}}}
        for c, loss in [(10, 0.5), (14, 0.8), (20, 1.2)]
    ]
    assert _derive_max_clients_by_loss(scenarios)[0]["max_clients"] == ">20"


def test_parse_series_derives_per_interval_metrics(tmp_path):
    # Two 0.5 s intervals. 100 packets delivered of 110 sent in the first,
    # 200 of 200 in the second, so loss appears only in the first.
    p = tmp_path / "r.series.json"
    p.write_text(json.dumps({
        "sampleMs": 500, "windowStartSec": 0.0, "windowEndSec": 1.0,
        "samples": [
            {"t": 0.0, "rxPackets": 0, "txPackets": 0, "rxBytes": 0,
             "delaySumNs": 0, "airtimeBusySec": 0.0},
            {"t": 0.5, "rxPackets": 100, "txPackets": 110, "rxBytes": 0,
             "delaySumNs": 200_000_000, "airtimeBusySec": 0.25},
            {"t": 1.0, "rxPackets": 300, "txPackets": 310, "rxBytes": 0,
             "delaySumNs": 500_000_000, "airtimeBusySec": 0.75},
        ],
    }))
    out = parse_series(p, payload_bytes=1000, clients=10)

    assert len(out) == 2
    # 100 pkt * 1000 B * 8 / 0.5 s = 1.6 Mbps
    assert out[0]["aggregate_throughput_mbps"] == pytest.approx(1.6)
    assert out[0]["per_user_throughput_mbps"] == pytest.approx(0.16)
    # 10 of 110 sent went missing in the first interval
    assert out[0]["packet_loss_pct"] == pytest.approx(9.091, abs=0.01)
    # 200 ms of delay over 100 packets
    assert out[0]["latency_ms"] == pytest.approx(2.0)
    # 0.25 s busy in a 0.5 s interval
    assert out[0]["airtime_utilization_pct"] == pytest.approx(50.0)

    # Second interval: 200 of 200 delivered, so no loss at all.
    assert out[1]["packet_loss_pct"] == pytest.approx(0.0)
    assert out[1]["aggregate_throughput_mbps"] == pytest.approx(3.2)


def test_parse_series_skips_zero_width_intervals(tmp_path):
    # The emitter once collapsed every timestamp to its integer second via a
    # sticky setprecision. Those intervals must be skipped, not divided by.
    p = tmp_path / "r.series.json"
    p.write_text(json.dumps({
        "samples": [
            {"t": 2.0, "rxPackets": 0, "txPackets": 0, "rxBytes": 0,
             "delaySumNs": 0, "airtimeBusySec": 0.0},
            {"t": 2.0, "rxPackets": 50, "txPackets": 50, "rxBytes": 0,
             "delaySumNs": 0, "airtimeBusySec": 0.0},
            {"t": 3.0, "rxPackets": 100, "txPackets": 100, "rxBytes": 0,
             "delaySumNs": 0, "airtimeBusySec": 0.5},
        ],
    }))
    out = parse_series(p, payload_bytes=1000, clients=5)
    assert len(out) == 1
    assert out[0]["t"] == 3.0


def test_parse_series_handles_an_interval_with_no_deliveries(tmp_path):
    p = tmp_path / "r.series.json"
    p.write_text(json.dumps({
        "samples": [
            {"t": 0.0, "rxPackets": 0, "txPackets": 0, "rxBytes": 0,
             "delaySumNs": 0, "airtimeBusySec": 0.0},
            {"t": 1.0, "rxPackets": 0, "txPackets": 40, "rxBytes": 0,
             "delaySumNs": 0, "airtimeBusySec": 0.1},
        ],
    }))
    out = parse_series(p, payload_bytes=1000, clients=4)
    assert out[0]["latency_ms"] == 0.0          # no NaN from dividing by zero rx
    assert out[0]["packet_loss_pct"] == pytest.approx(100.0)
    assert out[0]["aggregate_throughput_mbps"] == 0.0


def test_parse_series_returns_empty_for_a_single_sample(tmp_path):
    p = tmp_path / "r.series.json"
    p.write_text(json.dumps({"samples": [
        {"t": 0.0, "rxPackets": 0, "txPackets": 0, "rxBytes": 0,
         "delaySumNs": 0, "airtimeBusySec": 0.0}]}))
    assert parse_series(p, payload_bytes=1000, clients=4) == []


def _fm_xml(tmp_path, stats, classifier):
    """Minimal FlowMonitor document: FlowStats plus an Ipv4FlowClassifier."""
    rows = "".join(
        f'<Flow flowId="{f["id"]}" txPackets="{f["tx"]}" rxPackets="{f["rx"]}" '
        f'txBytes="{f.get("txbytes", f["bytes"])}" rxBytes="{f["bytes"]}" '
        f'lostPackets="0" delaySum="+0.0ns" jitterSum="+0.0ns" />' for f in stats)
    cls = "".join(
        f'<Flow flowId="{c["id"]}" sourceAddress="10.1.1.1" '
        f'destinationAddress="10.1.1.2" sourcePort="{c["sport"]}" '
        f'destinationPort="{c["dport"]}" protocol="6" />' for c in classifier)
    p = tmp_path / "fm.xml"
    p.write_text(
        f'<FlowMonitor><FlowStats>{rows}</FlowStats>'
        f'<Ipv4FlowClassifier>{cls}</Ipv4FlowClassifier></FlowMonitor>')
    return p


def test_tcp_ack_flows_are_excluded(tmp_path):
    # A bulk run opens a reverse ACK flow per client. Counting them reported
    # 20 flows for 10 clients and 431% of offered load.
    p = _fm_xml(
        tmp_path,
        stats=[
            {"id": 1, "tx": 100, "rx": 100, "bytes": 100 * (1448 + 40)},  # data
            {"id": 2, "tx": 100, "rx": 100, "bytes": 100 * 40},           # ACKs
        ],
        classifier=[
            {"id": 1, "sport": 49153, "dport": 5000},   # AP -> client
            {"id": 2, "sport": 5000, "dport": 49153},   # client -> AP
        ],
    )
    out = parse_flowmonitor(p, 1.0, payload_bytes=1448, app_port_base=5000,
                            app_port_count=10, header_bytes=40)
    assert len(out["per_flow_throughput_mbps"]) == 1, "ACK flow was counted"
    # 100 packets * 1448 B payload * 8 / 1 s = 1.1584 Mbps
    assert out["aggregate_throughput_mbps"] == pytest.approx(1.1584, abs=0.001)


def test_goodput_excludes_transport_headers_exactly(tmp_path):
    # rxBytes carries IP+UDP; payload must come out exact rather than assuming
    # every packet was a full segment.
    p = _fm_xml(
        tmp_path,
        stats=[{"id": 1, "tx": 50, "rx": 50, "bytes": 50 * (1200 + 28)}],
        classifier=[{"id": 1, "sport": 49153, "dport": 5000}],
    )
    out = parse_flowmonitor(p, 1.0, payload_bytes=1200, app_port_base=5000,
                            app_port_count=10, header_bytes=28)
    assert out["aggregate_throughput_mbps"] == pytest.approx(0.48, abs=1e-3)


def test_short_tcp_segments_are_not_rounded_up_to_full(tmp_path):
    # Half-full segments: the old rx_packets * payload_bytes shortcut would
    # report double the real goodput.
    p = _fm_xml(
        tmp_path,
        stats=[{"id": 1, "tx": 10, "rx": 10, "bytes": 10 * (724 + 40)}],
        classifier=[{"id": 1, "sport": 49153, "dport": 5000}],
    )
    out = parse_flowmonitor(p, 1.0, payload_bytes=1448, app_port_base=5000,
                            app_port_count=10, header_bytes=40)
    # 10 packets * 724 B payload * 8 = 0.05792 Mbps; the parser rounds
    # aggregates to 3 dp. The shortcut it replaces would have reported 0.116.
    assert out["aggregate_throughput_mbps"] == pytest.approx(0.058, abs=1e-3)
    assert out["aggregate_throughput_mbps"] < 0.08, "full-segment shortcut is back"


def test_a_run_without_a_classifier_keeps_every_flow(tmp_path):
    # Data recorded before the scenario emitted port metadata must still parse.
    p = tmp_path / "old.xml"
    p.write_text('<FlowMonitor><FlowStats>'
                 '<Flow flowId="1" txPackets="10" rxPackets="10" rxBytes="12280" '
                 'lostPackets="0" delaySum="+0.0ns" jitterSum="+0.0ns" />'
                 '</FlowStats></FlowMonitor>')
    out = parse_flowmonitor(p, 1.0, payload_bytes=1200)
    assert len(out["per_flow_throughput_mbps"]) == 1


def test_realised_offered_load_is_reported_separately(tmp_path):
    # A bursty source over a short window transmits less than its long-run
    # mean. Reconciling against the nominal figure fired the assertion at 8%
    # drift with nothing actually lost.
    p = _fm_xml(
        tmp_path,
        stats=[{"id": 1, "tx": 100, "rx": 100,
                "bytes": 100 * (1200 + 28), "txbytes": 100 * (1200 + 28)}],
        classifier=[{"id": 1, "sport": 49153, "dport": 5000}],
    )
    out = parse_flowmonitor(p, 1.0, payload_bytes=1200, app_port_base=5000,
                            app_port_count=10, header_bytes=28)
    # Nothing lost, so realised offered equals delivered.
    assert out["offered_realised_mbps"] == pytest.approx(0.96, abs=1e-3)
    assert out["aggregate_throughput_mbps"] == pytest.approx(0.96, abs=1e-3)
    assert out["packet_loss_pct"] == pytest.approx(0.0)
    # And that identity is what reconciliation must be checked against.
    check_reconciliation(out["aggregate_throughput_mbps"],
                         out["packet_loss_pct"],
                         out["offered_realised_mbps"])


def test_realised_offered_load_still_exposes_genuine_loss(tmp_path):
    # Separating demand from realised must not blind the check to real loss:
    # 40 of 100 packets never arrive.
    p = _fm_xml(
        tmp_path,
        stats=[{"id": 1, "tx": 100, "rx": 60,
                "bytes": 60 * (1200 + 28), "txbytes": 100 * (1200 + 28)}],
        classifier=[{"id": 1, "sport": 49153, "dport": 5000}],
    )
    out = parse_flowmonitor(p, 1.0, payload_bytes=1200, app_port_base=5000,
                            app_port_count=10, header_bytes=28)
    assert out["packet_loss_pct"] == pytest.approx(40.0)
    assert out["offered_realised_mbps"] == pytest.approx(0.96, abs=1e-3)
    assert out["aggregate_throughput_mbps"] == pytest.approx(0.576, abs=1e-3)
    # Consistent: 0.576 delivered of 0.96 offered is exactly 40% lost.
    check_reconciliation(out["aggregate_throughput_mbps"],
                         out["packet_loss_pct"],
                         out["offered_realised_mbps"])
