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


def test_no_crossing_within_grid_reports_over_200_not_extrapolated():
    points = [(20, 5.0), (60, 9.0), (120, 14.0), (200, 21.0)]
    assert interpolate_max_clients(points, threshold=50.0) == ">200"


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
