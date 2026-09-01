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
