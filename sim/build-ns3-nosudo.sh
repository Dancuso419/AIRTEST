#!/usr/bin/env bash
# Builds NS-3 3.42 in WSL2 without root.
#
# The apt-get step in setup-ns3.sh needs sudo, which an agent cannot supply
# interactively. Everything it installs is either already present or optional:
#   ninja       -> not needed; we generate Unix Makefiles instead
#   libxml2-dev -> only powers ConfigStore. FlowMonitor's SerializeToXmlFile
#                  writes XML directly through an ostream, so the metrics
#                  pipeline is unaffected.
# g++, cmake, python3, wget, tar and pkg-config were verified already present.
#
# Build is deliberately trimmed. WSL's ext4.vhdx lives on C:, which has ~5 GB
# free, and it grows dynamically -- the ~949 GB the guest reports is virtual.
# A default all-modules debug build (~8-10 GB) would fill the system drive.
#   --enable-modules   only what lecture-theatre.cc includes, plus deps
#   --build-profile=optimized  no debug symbols, no NS_LOG; far smaller AND
#                      3-5x faster per run, which compounds over 528 runs.
#                      NS_FATAL_ERROR (used by the scenario guards) still
#                      fires in this profile; NS_ASSERT and NS_LOG do not.
set -euo pipefail

NS3_VERSION="3.42"
WORKDIR="${HOME}/wifi-sim"
JOBS="$(nproc)"
MODULES="wifi,internet,applications,mobility,flow-monitor,network,core,propagation,stats"

mkdir -p "${WORKDIR}"
cd "${WORKDIR}"

if [ ! -d "ns-${NS3_VERSION}" ]; then
  echo "=== downloading ns-allinone-${NS3_VERSION} ==="
  wget -q --show-progress "https://www.nsnam.org/releases/ns-allinone-${NS3_VERSION}.tar.bz2"
  echo "=== extracting ==="
  tar xjf "ns-allinone-${NS3_VERSION}.tar.bz2"
  mv "ns-allinone-${NS3_VERSION}/ns-${NS3_VERSION}" .
  rm -rf "ns-allinone-${NS3_VERSION}" "ns-allinone-${NS3_VERSION}.tar.bz2"
fi

cd "ns-${NS3_VERSION}"

echo "=== configuring (Unix Makefiles, optimized, ${JOBS} jobs) ==="
echo "=== modules: ${MODULES} ==="
./ns3 clean || true
./ns3 configure -G "Unix Makefiles" \
  --build-profile=optimized \
  --enable-modules="${MODULES}" \
  --enable-examples \
  --disable-werror \
  --disable-python

echo "=== building ==="
./ns3 build -j "${JOBS}"

echo "=== BUILD OK: ${WORKDIR}/ns-${NS3_VERSION} ==="
du -sh "${WORKDIR}/ns-${NS3_VERSION}"
