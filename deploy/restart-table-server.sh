#!/usr/bin/env bash
# Reload backend after git pull + build. The supervisor loop restarts tsx within a few seconds.
set -euo pipefail
pkill -f "tsx src/local/server.ts" 2>/dev/null || true
echo "Sent stop to table server; fireverse-table.sh will restart it."
