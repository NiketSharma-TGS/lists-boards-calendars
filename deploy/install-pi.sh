#!/usr/bin/env bash
# Sets Lists & Boards up as a service on a Raspberry Pi (or any Linux box).
# Run it from inside the project folder:   bash deploy/install-pi.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install version 22.13 or newer first, for example:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi
NODE="$(command -v node)"
if ! "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  echo "Node $("$NODE" -v) is too old. This app needs 22.13 or newer (it uses Node's built-in SQLite)."
  exit 1
fi

mkdir -p "$DIR/data"
sed -e "s|__USER__|$USER_NAME|g" -e "s|__DIR__|$DIR|g" -e "s|__NODE__|$NODE|g" "$DIR/deploy/lists-boards.service" | sudo tee /etc/systemd/system/lists-boards.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now lists-boards.service
sleep 1
sudo systemctl --no-pager --lines=5 status lists-boards.service || true
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Done. Open http://${IP:-<pi-address>}:8080 from any device on your network."
echo "Check the Pi's time zone with: timedatectl   (the app's own time zone is in Settings)"
