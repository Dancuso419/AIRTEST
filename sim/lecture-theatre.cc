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
#include <fstream>
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
        // SLEEP / OFF: never entered by this scenario.
        break;
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

    // DL MU PPDUs need an explicit ack sequence type, set before any device is
    // installed because the ack manager reads the default at construction.
    // AGGR-MU-BAR is the sequence wifi-he-network.cc uses for DL OFDMA.
    if (standard == "wifi6")
    {
        Config::SetDefault("ns3::WifiDefaultAckManager::DlMuAckSequenceType",
                           EnumValue(WifiAcknowledgment::DL_MU_AGGREGATE_TF));
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

    // AP is node 0 (apNode is created before staNodes); its PHY observes the
    // whole BSS medium, so it is the right vantage point for airtime.
    g_phyWindowStart = appStart;
    g_phyWindowEnd = duration;
    Config::Connect("/NodeList/0/DeviceList/0/$ns3::WifiNetDevice/Phy/State/State",
                    MakeCallback(&PhyStateTrace));

    Simulator::Stop(Seconds(duration + 1.0));
    Simulator::Run();

    monitor->CheckForLostPackets();
    monitor->SerializeToXmlFile(out + ".xml", true, true);

    // The measurement window is a real quantity, not an assumed
    // "duration - appStart": emit the actual app start/stop and offered load so
    // the parser computes throughput and satisfaction ratio from real values.
    std::ofstream meta(out + ".meta.json");
    meta << "{\n"
         << "  \"standard\": \"" << standard << "\",\n"
         << "  \"clients\": " << clients << ",\n"
         << "  \"appStartSec\": " << appStart << ",\n"
         << "  \"appStopSec\": " << duration << ",\n"
         << "  \"measurementWindowSec\": " << (duration - appStart) << ",\n"
         << "  \"offeredLoadMbps\": " << (perClientMbps * clients) << "\n"
         << "}\n";
    meta.close();

    std::ofstream phyOut(out + ".phy.json");
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
