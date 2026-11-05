#!/usr/bin/env bash
# A local copy of the live stack, inside WSL2 Ubuntu 24.04.
#
#     bash /mnt/c/Users/<you>/Documents/MANNA/MannaHRM/localdev/setup_bench.sh
#
# Matches mannarubber.m.frappe.cloud: Frappe / ERPNext / HRMS / India Compliance,
# all version-16. Safe to run again; every step skips what is already there.
#
# The bench lives in the Linux filesystem (~/frappe-bench), not under /mnt/c:
# Frappe reads thousands of small files on every request and the Windows mount
# makes that an order of magnitude slower. manna_hr is the exception — it is
# symlinked from the Windows checkout so an edit in VS Code is the edit the
# site runs.

set -euo pipefail

BENCH_DIR="${BENCH_DIR:-$HOME/frappe-bench}"
BRANCH="version-16"
# The MannaHRM checkout this script sits in, so it runs under any Windows login.
MANNA_HR_SRC="${MANNA_HR_SRC:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MARIADB_VERSION="11.8"
PYTHON_VERSION="3.14"
NODE_VERSION="24"

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

if ! grep -qi microsoft /proc/version 2>/dev/null; then
	echo "Run this inside WSL (Ubuntu), not Git Bash or PowerShell." >&2
	exit 1
fi

# The office network is behind Cloudflare Gateway, which re-signs HTTPS for
# some hosts (r.mariadb.com, astral.sh) with its own CA and not others
# (github.com, pypi.org) — so a setup that trusts only the public roots gets
# halfway and then fails on whichever host is inspected. Windows already trusts
# that CA; this copies it from there rather than from a file in the repo, so a
# rotated CA is picked up on the next run.
say "Office HTTPS certificate"
GATEWAY_CA=/usr/local/share/ca-certificates/cloudflare-gateway.crt
if command -v powershell.exe >/dev/null; then
	PEM="$(powershell.exe -NoProfile -Command '
		Get-ChildItem Cert:\LocalMachine\Root, Cert:\CurrentUser\Root |
		Where-Object { $_.Subject -like "*Gateway CA - Cloudflare*" } |
		ForEach-Object { "-----BEGIN CERTIFICATE-----"; [Convert]::ToBase64String($_.RawData, "InsertLineBreaks"); "-----END CERTIFICATE-----" }
	' | tr -d '\r')"
	if [ -n "$PEM" ]; then
		printf '%s\n' "$PEM" | sudo tee "$GATEWAY_CA" >/dev/null
		sudo update-ca-certificates >/dev/null
		echo "Trusted the office gateway CA."
	else
		echo "No Cloudflare Gateway CA on this PC; nothing to add."
	fi
fi
# Node, pip and uv each carry their own roots instead of the system's. Pointed
# at the system bundle here and in ~/.profile, so bench's own later calls to
# them (bench build, bench get-app) trust the gateway too.
SYSTEM_CA=/etc/ssl/certs/ca-certificates.crt
CA_ENV="export NODE_EXTRA_CA_CERTS=$SYSTEM_CA REQUESTS_CA_BUNDLE=$SYSTEM_CA PIP_CERT=$SYSTEM_CA SSL_CERT_FILE=$SYSTEM_CA UV_NATIVE_TLS=1"
grep -qxF "$CA_ENV" "$HOME/.profile" || echo "$CA_ENV" >> "$HOME/.profile"
eval "$CA_ENV"

say "System packages"
# Unattended: a package that asks a question (mariadb-server does) waits
# forever for an answer in a window nobody can see.
sudo DEBIAN_FRONTEND=noninteractive dpkg --configure -a
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git curl build-essential pkg-config redis-server \
	xvfb libfontconfig fontconfig cron libmariadb-dev \
	software-properties-common ca-certificates apt-transport-https

# Ubuntu's own MariaDB is 10.11. Frappe Cloud's dumps use the uca1400
# collations that only 11.x knows, so restoring one into 10.11 fails halfway
# with "Unknown collation" — the repo below is why.
if ! command -v mariadb >/dev/null || ! mariadb --version | grep -q "$MARIADB_VERSION"; then
	say "MariaDB $MARIADB_VERSION"
	curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup \
		| sudo bash -s -- --mariadb-server-version="mariadb-$MARIADB_VERSION"
	sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client
fi

# Frappe needs utf8mb4 everywhere; without this a restored site with Malayalam
# names in it comes back as question marks.
sudo tee /etc/mysql/mariadb.conf.d/99-frappe.cnf >/dev/null <<'EOF'
[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
innodb_buffer_pool_size = 1G
max_allowed_packet = 256M

[mysql]
default-character-set = utf8mb4
EOF
sudo service mariadb restart
sudo service redis-server start || true

# The MariaDB root password bench uses to create a site. Kept in a file only
# this user can read, so the restore script finds it without asking again.
DB_ROOT_FILE="$HOME/.frappe-db-root"
if [ ! -f "$DB_ROOT_FILE" ]; then
	say "MariaDB root password"
	head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' > "$DB_ROOT_FILE"
	chmod 600 "$DB_ROOT_FILE"
	sudo mariadb -e "ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('$(cat "$DB_ROOT_FILE")'); FLUSH PRIVILEGES;"
fi

say "uv, Python $PYTHON_VERSION and bench"
if ! command -v uv >/dev/null; then
	curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"
uv python install "$PYTHON_VERSION"
command -v bench >/dev/null || uv tool install frappe-bench

say "Node $NODE_VERSION and yarn"
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
	curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
# nvm puts node on PATH from ~/.bashrc, which only an interactive terminal
# reads; `bench start` launched any other way (a shortcut, a service, a
# `wsl -- bash -lc`) then dies at socketio with "node not found". ~/.profile is
# read by every login shell.
NVM_LINE='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
grep -qxF "$NVM_LINE" "$HOME/.profile" || echo "$NVM_LINE" >> "$HOME/.profile"
command -v yarn >/dev/null || npm install -g yarn

if [ ! -d "$BENCH_DIR" ]; then
	say "bench init ($BRANCH)"
	# --skip-assets: init's own build clears the bench's Redis cache, which
	# is not running yet. Under WSL's mirrored networking a closed local port
	# does not refuse, it hangs, so that is a 20-second timeout per attempt and
	# then a failed init. The build runs at the end instead, with Redis up.
	bench init "$BENCH_DIR" --frappe-branch "$BRANCH" --skip-assets \
		--python "$(uv python find "$PYTHON_VERSION")"
fi
cd "$BENCH_DIR"

# The tip of frappe's version-16 branch says __version__ = "17.0.0" between
# releases, and India Compliance reads that and refuses to install ("Frappe
# version 17.0.0 not compatible"). Releases are tags, so frappe sits on the
# newest v16 tag; erpnext and hrms on their branches carry real 16.x numbers.
FRAPPE_TAG="$(git -C apps/frappe ls-remote --tags --refs upstream 'v16.*' \
	| sed 's|.*/||' | grep -E '^v16\.[0-9]+\.[0-9]+$' | sort -V | tail -1)"
if [ "$(git -C apps/frappe describe --tags --exact-match 2>/dev/null)" != "$FRAPPE_TAG" ]; then
	say "frappe $FRAPPE_TAG"
	git -C apps/frappe fetch --depth 1 upstream tag "$FRAPPE_TAG"
	git -C apps/frappe -c advice.detachedHead=false checkout "$FRAPPE_TAG"
	uv pip install --quiet -e apps/frappe --python env/bin/python
fi

# The bench's own Redis (cache 13000, queue 11000), which `bench start` would
# run. get-app and build both talk to it.
for conf in redis_cache redis_queue; do
	timeout 3 redis-cli -p "$(grep -oP '^port \K\d+' "config/$conf.conf")" ping >/dev/null 2>&1 \
		|| redis-server "config/$conf.conf" --daemonize yes
done

get_app() {
	local name="$1" repo="$2"
	[ -d "apps/$name" ] || bench get-app --branch "$BRANCH" --skip-assets "$repo"
}
say "Apps"
get_app erpnext https://github.com/frappe/erpnext
get_app hrms https://github.com/frappe/hrms
get_app india_compliance https://github.com/resilient-tech/india-compliance

# A symlink, not `bench get-app`, which would clone a copy nobody edits.
if [ ! -e apps/manna_hr ]; then
	ln -s "$MANNA_HR_SRC" apps/manna_hr
	./env/bin/pip install -e apps/manna_hr
fi
# bench writes apps.txt with no final newline, so a bare `echo >>` glues the
# name onto the last app ("erpnextmanna_hr") and every bench command after it
# fails to import. Rewritten whole instead, and repaired if an earlier run
# did exactly that.
if ! grep -qx manna_hr sites/apps.txt; then
	{ sed 's/manna_hr$//' sites/apps.txt | grep -v '^$'; echo manna_hr; } > sites/apps.txt.new
	mv sites/apps.txt.new sites/apps.txt
fi

bench build

say "Done"
echo "Bench: $BENCH_DIR"
echo "Next:  bash $MANNA_HR_SRC/localdev/new_site.sh   (see localdev/README.md)"
