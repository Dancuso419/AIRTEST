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
#include "ns3/spectrum-module.h"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <vector>
#include <iomanip>
#include <string>

using namespace ns3;

NS_LOG_COMPONENT_DEFINE("LectureTheatre");

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
static double g_phyWindowEnd = 0.0;

static void
PhyStateTrace(std::string context, Time start, Time duration, WifiPhyState state)
{
    // Only count the overlap with the measurement window. The start clamp keeps
    // association traffic before appStart out; the end clamp keeps the drain
    // period after appStop out (Simulator::Stop is duration + 1.0 s), without
    // which idle time would exceed the window.
    double startS = std::max(start.GetSeconds(), g_phyWindowStart);
    double endS = std::min(start.GetSeconds() + duration.GetSeconds(), g_phyWindowEnd);
    double counted = endS - startS;
    if (counted <= 0.0)
    {
        return;
    }

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
        // SLEEP / OFF are never entered by this scenario. Silently dropping
        // them would surface later as an unexplained shortfall against
        // measured_window_s rather than as an error.
        NS_FATAL_ERROR("Unhandled WifiPhyState in PhyStateTrace: " << state);
    }
}

/**
 * Periodic time-series sampling.
 *
 * The dashboard replays a run second by second, so the needles move because
 * the data moves rather than because a timer is pretending. That requires the
 * run to record what it was doing over time, not only its endpoint.
 *
 * Only CUMULATIVE counters are emitted. Every derived metric (goodput, loss,
 * latency) is computed downstream by the same Python code that computes the
 * aggregates, so the series and the summary can never disagree about what a
 * metric means. Deriving them here would duplicate that arithmetic in a
 * second language and invite exactly that divergence.
 */
struct Sample
{
    double t;
    uint64_t rxPackets;
    uint64_t txPackets;
    uint64_t rxBytes;
    double delaySumNs;
    double airtimeBusyS;
};

static std::vector<Sample> g_series;

static void
SampleFlows(Ptr<FlowMonitor> monitor, double intervalSec, double stopSec)
{
    // Read current counters without CheckForLostPackets(): calling it mid-run
    // repeatedly would perturb the very loss accounting the study reports.
    uint64_t rxP = 0, txP = 0, rxB = 0;
    double delayNs = 0.0;
    for (const auto& kv : monitor->GetFlowStats())
    {
        rxP += kv.second.rxPackets;
        txP += kv.second.txPackets;
        rxB += kv.second.rxBytes;
        delayNs += kv.second.delaySum.GetNanoSeconds();
    }

    g_series.push_back({Simulator::Now().GetSeconds(), rxP, txP, rxB, delayNs,
                        g_apPhy.tx + g_apPhy.rx + g_apPhy.busy});

    if (Simulator::Now().GetSeconds() + intervalSec <= stopSec + 1e-9)
    {
        Simulator::Schedule(Seconds(intervalSec), &SampleFlows, monitor, intervalSec, stopSec);
    }
}

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
    // OFDMA is the mechanism under study (PRD objective 2: identify which
    // WiFi 6 mechanisms account for observed differences). Switchable so the
    // study can isolate its effect, and so its cost can be measured.
    bool ofdma = true;
    // Sampling period for the time series, in milliseconds of simulated time.
    double sampleMs = 100.0;

    // DL MU PPDUs need an explicit ack sequence type. Two ordering constraints
    // apply and both are load-bearing: it must precede the first wifi.Install
    // (the ack manager reads the default at construction), and it must precede
    // cmd.Parse so an explicit --ns3::WifiDefaultAckManager::... on the command
    // line still wins. Set unconditionally: wifi5 never emits DL MU PPDUs, so
    // this attribute is never consulted there.
    // AGGR-MU-BAR is the sequence wifi-he-network.cc uses for DL OFDMA.
    Config::SetDefault("ns3::WifiDefaultAckManager::DlMuAckSequenceType",
                       EnumValue(WifiAcknowledgment::DL_MU_AGGREGATE_TF));

    CommandLine cmd(__FILE__);
    cmd.AddValue("standard", "wifi5 (802.11ac) or wifi6 (802.11ax)", standard);
    cmd.AddValue("traffic", "web, video, or bulk", traffic);
    cmd.AddValue("clients", "Number of client stations", clients);
    cmd.AddValue("aps", "Number of access points (1 or 3)", aps);
    cmd.AddValue("seed", "RNG run number for this trial", seed);
    cmd.AddValue("ofdma", "wifi6 only: enable DL OFDMA multi-user scheduling", ofdma);
    cmd.AddValue("sampleMs", "time-series sampling period, simulated ms", sampleMs);
    cmd.AddValue("duration", "Simulated seconds", duration);
    cmd.AddValue("out", "Output path prefix", out);
    cmd.Parse(argc, argv);

    if (standard != "wifi5" && standard != "wifi6")
    {
        NS_FATAL_ERROR("--standard must be wifi5 or wifi6, got: " << standard);
    }
    if (traffic != "video" && traffic != "web" && traffic != "bulk")
    {
        NS_FATAL_ERROR("--traffic must be web, video or bulk, got: " << traffic);
    }
    if (aps != 1 && aps != 3)
    {
        NS_FATAL_ERROR("--aps must be 1 or 3, got: " << aps);
    }

    // Per-trial randomisation. Seed is fixed; the run number varies per trial,
    // which is the pattern NS-3 documents for independent replications.
    RngSeedManager::SetSeed(12345);
    RngSeedManager::SetRun(seed);

    NodeContainer apNode;
    apNode.Create(aps);
    NodeContainer staNodes;
    staNodes.Create(clients);

    // Channel: log-distance path loss plus Nakagami-m fading, so repeated
    // trials with different run numbers actually differ.
    //
    // ponytail: MultiModelSpectrumChannel + SpectrumWifiPhyHelper, not
    // YansWifiChannelHelper/YansWifiPhyHelper, despite the latter being
    // simpler. Confirmed by testing: RrMultiUserScheduler (the OFDMA
    // scheduler wifi6 depends on) over a Yans channel produces ~100% loss
    // on every flow (self-collisions: BUSY_DECODING_PREAMBLE /
    // PREAMBLE_DETECTION_PACKET_SWITCH) — Yans has no per-subband spectrum
    // model, which HE PPDUs need. This matches ns-3's own
    // wifi-he-network.cc example, which switches to the spectrum stack
    // specifically when OFDMA is enabled, with the comment:
    // "SingleModelSpectrumChannel cannot be used with 802.11ax because
    // two spectrum models are required: one with 78.125 kHz bands for HE
    // PPDUs and one with 312.5 kHz bands for non-HT PPDUs." Same
    // propagation-loss and mobility models either way.
    Ptr<MultiModelSpectrumChannel> spectrumChannel = CreateObject<MultiModelSpectrumChannel>();
    Ptr<LogDistancePropagationLossModel> logDistance =
        CreateObject<LogDistancePropagationLossModel>();
    logDistance->SetAttribute("Exponent", DoubleValue(3.0));
    logDistance->SetAttribute("ReferenceDistance", DoubleValue(1.0));
    logDistance->SetAttribute("ReferenceLoss", DoubleValue(46.6777));
    spectrumChannel->AddPropagationLossModel(logDistance);
    spectrumChannel->AddPropagationLossModel(CreateObject<NakagamiPropagationLossModel>());
    spectrumChannel->SetPropagationDelayModel(CreateObject<ConstantSpeedPropagationDelayModel>());

    SpectrumWifiPhyHelper phy;
    phy.SetChannel(spectrumChannel);
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

    // Each AP runs its own BSS on the SAME channel. Co-channel overlap is the
    // condition under study: it is where BSS coloring earns its place and,
    // per the TRD, where single-AP results understate WiFi 6.
    //
    // Clients are assigned to APs by SEAT COLUMN, and the APs are spread
    // across the room's width. The modelled room is wider (10 m) than it is
    // deep (1.2 m per row), so distributing along the depth put the APs only
    // ~2.4 m apart at these densities — closer than any real ceiling
    // deployment, which inflates co-channel interference. Splitting by column
    // gives a constant ~3.3 m spacing that does not shrink as the cohort does.
    //
    // Round-robin assignment would scatter every BSS across the whole room and
    // measure association geometry rather than contention.
    std::vector<Ssid> ssids;
    for (uint32_t a = 0; a < aps; ++a)
    {
        ssids.push_back(Ssid(aps == 1 ? "lecture-theatre"
                                      : ("lecture-theatre-" + std::to_string(a)).c_str()));
    }

    const uint32_t gridWidthConst = 10;
    auto servingAp = [&](uint32_t i) {
        return std::min((i % gridWidthConst) * aps / gridWidthConst, aps - 1);
    };

    WifiMacHelper mac;

    NetDeviceContainer staDevices;
    for (uint32_t i = 0; i < clients; ++i)
    {
        mac.SetType("ns3::StaWifiMac", "Ssid", SsidValue(ssids[servingAp(i)]));
        staDevices.Add(wifi.Install(phy, mac, staNodes.Get(i)));
    }

    NetDeviceContainer apDevices;
    for (uint32_t a = 0; a < aps; ++a)
    {
    if (standard == "wifi6")
    {
        // OFDMA downlink scheduling. This is the mechanism under study and is
        // the defining difference from the wifi5 configuration.
        mac.SetType("ns3::ApWifiMac",
                    "Ssid", SsidValue(ssids[a]),
                    "EnableBeaconJitter", BooleanValue(false));
        if (ofdma)
        {
            mac.SetMultiUserScheduler("ns3::RrMultiUserScheduler",
                                      "EnableUlOfdma", BooleanValue(false),
                                      "EnableBsrp", BooleanValue(false));
        }
        // With --ofdma=0 the AP keeps HE rates but sends single-user PPDUs,
        // isolating what OFDMA itself contributes to both throughput and
        // simulation cost.
    }
    else
    {
        mac.SetType("ns3::ApWifiMac",
                    "Ssid", SsidValue(ssids[a]),
                    "EnableBeaconJitter", BooleanValue(false));
    }
        apDevices.Add(wifi.Install(phy, mac, apNode.Get(a)));
    }

    // BSS coloring: WiFi 6 only, and only meaningful with overlapping BSSs.
    // The TRD is explicit that it must never be presented as a factor in
    // single-AP results, so it is not set there at all.
    if (standard == "wifi6" && aps > 1)
    {
        for (uint32_t a = 0; a < aps; ++a)
        {
            Ptr<WifiNetDevice> dev = DynamicCast<WifiNetDevice>(apDevices.Get(a));
            dev->GetHeConfiguration()->SetAttribute("BssColor", UintegerValue(a + 1));
        }
    }

    // Seated grid: 1.0 m seat pitch, 1.2 m row pitch, 10 seats per row.
    // A single AP sits at the front, 3 m up. With three APs each is placed
    // over the centre of the band of seats it serves, so coverage matches the
    // association blocks rather than cutting across them.
    const uint32_t gridWidth = 10;
    const double seatPitch = 1.0;
    const double rowPitch = 1.2;

    MobilityHelper mobility;
    Ptr<ListPositionAllocator> apPos = CreateObject<ListPositionAllocator>();
    if (aps == 1)
    {
        apPos->Add(Vector(5.0, -2.0, 3.0));
    }
    else
    {
        // Depth of the occupied seating, so the APs sit over its middle.
        const uint32_t rows = (clients + gridWidth - 1) / gridWidth;
        const double midDepth = (rows > 0 ? (rows - 1) : 0) * rowPitch / 2.0;

        for (uint32_t a = 0; a < aps; ++a)
        {
            // Centre of the column band this AP serves, in metres.
            const double firstCol = std::ceil(a * double(gridWidth) / aps);
            const double lastCol = std::ceil((a + 1) * double(gridWidth) / aps) - 1;
            apPos->Add(Vector((firstCol + lastCol) / 2.0 * seatPitch, midDepth, 3.0));
        }
    }
    mobility.SetPositionAllocator(apPos);
    mobility.SetMobilityModel("ns3::ConstantPositionMobilityModel");
    mobility.Install(apNode);

    mobility.SetPositionAllocator("ns3::GridPositionAllocator",
                                  "MinX", DoubleValue(0.0),
                                  "MinY", DoubleValue(0.0),
                                  "DeltaX", DoubleValue(seatPitch),
                                  "DeltaY", DoubleValue(rowPitch),
                                  "GridWidth", UintegerValue(gridWidth),
                                  "LayoutType", StringValue("RowFirst"));
    mobility.SetMobilityModel("ns3::ConstantPositionMobilityModel");
    mobility.Install(staNodes);

    InternetStackHelper stack;
    stack.Install(apNode);
    stack.Install(staNodes);

    Ipv4AddressHelper address;
    address.SetBase("10.1.1.0", "255.255.255.0");
    Ipv4InterfaceContainer apInterface = address.Assign(apDevices);
    Ipv4InterfaceContainer staInterfaces = address.Assign(staDevices);

    // Downlink CBR UDP video: AP sends, each client receives.
    // Offered load is exactly 3.0 Mbps * clients, which makes the
    // throughput/loss/offered-load reconciliation checkable by hand.
    // Traffic profiles, per TRD section 3. Offered load is the MEAN rate per
    // client; for the bursty profile that is the wire rate times the duty
    // cycle, not the wire rate itself, and the parser's offered-load table
    // must agree with the mean or every satisfaction ratio is wrong.
    //
    //   web    bursty on/off over UDP, 0.5 Mbps mean  (1 Mbps at 50% duty)
    //   video  CBR over UDP, 3 Mbps
    //   bulk   long-lived TCP, rate-limited to 5 Mbps
    //
    // Bulk is rate-limited rather than left to saturate so that offered load
    // stays a defined quantity and the satisfaction ratio remains meaningful.
    const bool isBulk = (traffic == "bulk");
    const std::string socketFactory =
        isBulk ? "ns3::TcpSocketFactory" : "ns3::UdpSocketFactory";

    double perClientMbps;   // mean offered load
    double wireRateMbps;    // rate while the source is on
    std::string onTime;
    std::string offTime;
    uint32_t payloadBytes;

    if (traffic == "web")
    {
        perClientMbps = 0.5;
        wireRateMbps = 1.0;
        // Exponential on/off with equal means gives a 50% duty cycle, so the
        // mean lands on 0.5 Mbps while the traffic stays genuinely bursty.
        onTime = "ns3::ExponentialRandomVariable[Mean=0.5]";
        offTime = "ns3::ExponentialRandomVariable[Mean=0.5]";
        payloadBytes = 512;
    }
    else if (isBulk)
    {
        perClientMbps = 5.0;
        wireRateMbps = 5.0;
        onTime = "ns3::ConstantRandomVariable[Constant=1]";
        offTime = "ns3::ConstantRandomVariable[Constant=0]";
        payloadBytes = 1448;   // one full TCP segment on a 1500-byte MTU
    }
    else
    {
        perClientMbps = 3.0;
        wireRateMbps = 3.0;
        onTime = "ns3::ConstantRandomVariable[Constant=1]";
        offTime = "ns3::ConstantRandomVariable[Constant=0]";
        payloadBytes = 1200;
    }

    const uint16_t basePort = 5000;
    const double appStart = 2.0;

    ApplicationContainer sinks;
    ApplicationContainer sources;

    for (uint32_t i = 0; i < clients; ++i)
    {
        uint16_t port = basePort + i;

        PacketSinkHelper sinkHelper(socketFactory,
                                    InetSocketAddress(Ipv4Address::GetAny(), port));
        sinks.Add(sinkHelper.Install(staNodes.Get(i)));

        OnOffHelper onoff(socketFactory,
                          InetSocketAddress(staInterfaces.GetAddress(i), port));
        onoff.SetAttribute("OnTime", StringValue(onTime));
        onoff.SetAttribute("OffTime", StringValue(offTime));
        onoff.SetAttribute("DataRate", DataRateValue(DataRate(wireRateMbps * 1e6)));
        onoff.SetAttribute("PacketSize", UintegerValue(payloadBytes));
        // Install on the AP this client is associated with. Sourcing every
        // flow from AP 0 would send two thirds of the traffic across BSS
        // boundaries and measure routing, not contention.
        sources.Add(onoff.Install(apNode.Get(servingAp(i))));
    }

    sinks.Start(Seconds(0.0));
    sinks.Stop(Seconds(duration));
    // Traffic starts after association has settled, so the measurement window
    // is not polluted by association overhead.
    sources.Start(Seconds(appStart));
    sources.Stop(Seconds(duration));

    FlowMonitorHelper flowmonHelper;
    Ptr<FlowMonitor> monitor = flowmonHelper.InstallAll();

    // AP is node 0 (apNode is created before staNodes); its PHY observes the
    // whole BSS medium, so it is the right vantage point for airtime.
    g_phyWindowStart = appStart;
    g_phyWindowEnd = duration;
    Config::Connect("/NodeList/0/DeviceList/0/$ns3::WifiNetDevice/Phy/State/State",
                    MakeCallback(&PhyStateTrace));

    // Stop at exactly `duration`, not duration + 1.0. The offered-traffic
    // window, the FlowMonitor accounting window and the PHY accounting window
    // must be the same interval [appStart, duration]. A drain tail would let
    // FlowMonitor keep counting rxBytes for backlog leaving the AP queue after
    // the sources stopped, inflating delivered throughput above offered load —
    // and worse, inflating it *with* density, since the queue is deeper at high
    // client counts. Packets still in flight at cutoff now count as
    // undelivered, which is the honest reading for a fixed measurement period
    // and is symmetric across both standards.
    // First sample at appStart, so the series covers exactly the measurement
    // window and never includes association traffic.
    Simulator::Schedule(Seconds(appStart), &SampleFlows, monitor, sampleMs / 1000.0, duration);

    Simulator::Stop(Seconds(duration));
    Simulator::Run();

    monitor->CheckForLostPackets();

    // FlowMonitor::SerializeToXmlFile does not check that its ofstream opened,
    // so a bad --out directory would exit 0 with no artifacts and the batch
    // runner would record a successful run. Probe the path first.
    {
        std::ofstream xmlProbe(out + ".xml");
        if (!xmlProbe.is_open())
        {
            NS_FATAL_ERROR("Cannot open " << out << ".xml for writing; check --out");
        }
    }
    monitor->SerializeToXmlFile(out + ".xml", true, true);

    // The measurement window is a real quantity, not an assumed
    // "duration - appStart": emit the actual app start/stop and offered load so
    // the parser computes throughput and satisfaction ratio from real values.
    {
        std::ofstream series(out + ".series.json");
        if (!series.is_open())
        {
            NS_FATAL_ERROR("Cannot open " << out << ".series.json for writing; check --out");
        }
        series << "{\n"
               << "  \"sampleMs\": " << sampleMs << ",\n"
               << "  \"windowStartSec\": " << appStart << ",\n"
               << "  \"windowEndSec\": " << duration << ",\n"
               << "  \"samples\": [\n";
        for (size_t i = 0; i < g_series.size(); ++i)
        {
            const Sample& x = g_series[i];
            // Every field sets its own precision explicitly. setprecision is
            // sticky on the stream, so a single setprecision(0) for delaySumNs
            // silently truncated the NEXT row's timestamp to its integer
            // second and collapsed every interval to zero width.
            series << "    {\"t\": " << std::fixed << std::setprecision(4) << x.t
                   << ", \"rxPackets\": " << x.rxPackets
                   << ", \"txPackets\": " << x.txPackets
                   << ", \"rxBytes\": " << x.rxBytes
                   << ", \"delaySumNs\": " << std::setprecision(0) << x.delaySumNs
                   << ", \"airtimeBusySec\": " << std::setprecision(6) << x.airtimeBusyS << "}"
                   << (i + 1 < g_series.size() ? "," : "") << "\n";
        }
        series << "  ]\n}\n";
    }

    std::ofstream meta(out + ".meta.json");
    if (!meta.is_open())
    {
        NS_FATAL_ERROR("Cannot open " << out << ".meta.json for writing; check --out");
    }
    meta << "{\n"
         << "  \"standard\": \"" << standard << "\",\n"
         // A run must describe itself: an --ofdma=0 trial is not comparable
         // with the default ones and must never be mistaken for one.
         << "  \"ofdma\": " << ((standard == "wifi6" && ofdma) ? "true" : "false") << ",\n"
         << "  \"clients\": " << clients << ",\n"
         << "  \"appStartSec\": " << appStart << ",\n"
         << "  \"appStopSec\": " << duration << ",\n"
         << "  \"measurementWindowSec\": " << (duration - appStart) << ",\n"
         << "  \"offeredLoadMbps\": " << (perClientMbps * clients) << ",\n"
         // offeredLoadMbps is an application-layer payload rate, but
         // FlowMonitor's rxBytes includes the 28-byte IP+UDP header per packet.
         // Comparing the two directly reads 102% of offered load at zero actual
         // over-delivery. Emit the payload size so the parser can convert
         // rxBytes to payload bytes (rxPackets * payloadBytes) and compare like
         // with like.
         << "  \"payloadBytes\": " << payloadBytes << ",\n"
         // TCP opens a reverse ACK flow per client, which FlowMonitor reports
         // as its own <Flow>. Without the port base the parser sums those ACKs
         // as if they were payload: bulk read 20 flows for 10 clients and 431%
         // of offered load. headerBytes lets goodput come from rxBytes exactly,
         // rather than assuming every packet carries a full segment.
         << "  \"transport\": \"" << (isBulk ? "tcp" : "udp") << "\",\n"
         << "  \"headerBytes\": " << (isBulk ? 40 : 28) << ",\n"
         << "  \"appPortBase\": " << basePort << "\n"
         << "}\n";
    meta.close();

    std::ofstream phyOut(out + ".phy.json");
    if (!phyOut.is_open())
    {
        NS_FATAL_ERROR("Cannot open " << out << ".phy.json for writing; check --out");
    }
    phyOut << std::fixed << std::setprecision(6)
           << "{\n"
           << "  \"ap_tx_s\": " << g_apPhy.tx << ",\n"
           << "  \"ap_rx_s\": " << g_apPhy.rx << ",\n"
           << "  \"ap_busy_s\": " << g_apPhy.busy << ",\n"
           << "  \"ap_idle_s\": " << g_apPhy.idle << ",\n"
           << "  \"measured_window_s\": " << (duration - appStart) << "\n"
           << "}\n";
    phyOut.close();

    Simulator::Destroy();
    return 0;
}
