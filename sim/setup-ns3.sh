#!/usr/bin/env bash
# Builds NS-3 3.42 inside WSL2 Ubuntu. Run from WSL, not from Windows.
set -euo pipefail

NS3_VERSION="3.42"
WORKDIR="${HOME}/wifi-sim"

sudo apt-get update
sudo apt-get install -y \
  g++ cmake ninja-build python3 python3-pip python3-venv \
  libxml2 libxml2-dev pkg-config wget tar

mkdir -p "${WORKDIR}"
cd "${WORKDIR}"

if [ ! -d "ns-3.${NS3_VERSION}" ]; then
  wget -q "https://www.nsnam.org/releases/ns-allinone-${NS3_VERSION}.tar.bz2"
  tar xjf "ns-allinone-${NS3_VERSION}.tar.bz2"
  mv "ns-allinone-${NS3_VERSION}/ns-${NS3_VERSION}" .
  rm -rf "ns-allinone-${NS3_VERSION}" "ns-allinone-${NS3_VERSION}.tar.bz2"
fi

cd "ns-${NS3_VERSION}"
./ns3 configure --enable-examples --disable-werror
./ns3 build

echo "NS-3 ${NS3_VERSION} built at ${WORKDIR}/ns-${NS3_VERSION}"
