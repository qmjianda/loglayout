#!/bin/bash
# LogLayer Linux Packaging Script

# Check for python3
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 not found! Please install it."
    exit 1
fi

# Run the packaging script
python3 tools/package_offline.py

# Optional: keep terminal open if run via file manager
if [ -t 0 ]; then
    echo "Press enter to exit..."
    read -r
fi
