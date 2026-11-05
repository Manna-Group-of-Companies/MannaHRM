#!/usr/bin/env bash
# ERPNext on http://localhost:8000. Leave the window open; Ctrl+C stops it.
#
#     wsl -d Ubuntu-24.04 -- bash -l /mnt/c/Users/Melvin/Documents/MANNA/MannaHRM/localdev/start.sh
#
# The bench's Redis may already be running from setup (new_site.sh starts it
# to make a site); bench start wants to start its own and fails to bind if so.

set -euo pipefail
cd "${BENCH_DIR:-$HOME/frappe-bench}"
sudo service mariadb start >/dev/null
# `timeout` because a port nothing listens on hangs rather than refuses under
# WSL's mirrored networking, and redis-cli would wait on it forever.
for port in 13000 11000; do
	timeout 3 redis-cli -p "$port" shutdown nosave >/dev/null 2>&1 || true
done
exec bench start
