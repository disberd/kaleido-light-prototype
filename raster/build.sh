#!/bin/bash
# kl-raster (SVG to PNG/JPEG/PDF) into bin/; it replaces the resvg CLI of earlier iterations.
set -e
cd "$(dirname "$0")"
cargo build --release
mkdir -p ../bin
cp target/release/kl-raster ../bin/kl-raster
strip ../bin/kl-raster
