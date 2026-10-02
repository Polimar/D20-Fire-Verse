#!/usr/bin/env bash
# Keep the table server up. cron starts this at boot; a second copy exits.
# Logs: ~/.local/state/d20-fireverse/table.log

set -u

ROOT="/home/d20/D20-Fire-Verse"
STATE="${HOME}/.local/state/d20-fireverse"
mkdir -p "$STATE"

exec 9>"$STATE/table.lock"
if ! flock -n 9; then
  exit 0
fi

export PATH="${HOME}/.local/opt/node/bin:${HOME}/.local/opt/ffmpeg:${PATH}"
cd "$ROOT"

exec >>"$STATE/table.log" 2>&1
echo "----- $(date -Is) table server starting -----"

while true; do
  npm run dev:backend || true
  echo "----- $(date -Is) table server exited, restarting in 3s -----"
  sleep 3
done
