#!/bin/bash
# LogLayer Linux Standalone Packaging Script

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 not found!"
    exit 1
fi

python3 tools/package_offline.py --exe

if [ -t 0 ]; then
    echo "Press enter to exit..."
    read -r
fi
