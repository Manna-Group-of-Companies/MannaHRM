#!/bin/sh
# Installs the Manna attendance bridge on Linux: a Raspberry Pi, a mini PC,
# anything with systemd and Python 3.11 or newer.
#
#     sudo sh install.sh                 install, or upgrade and keep the setup
#     sudo sh install.sh --reconfigure   add a machine, or change the key
#     sudo sh install.sh --status        is it running, and the end of its log
#     sudo sh install.sh --uninstall     stop it; every file is kept
#
# Runs the bridge as its own system user, with the key in a file only that user
# can read, and systemd restarting it for ever. Logs: journalctl -u mannabridge
#
# This file must keep LF line endings (.gitattributes says so). With CRLF the
# shell reads "sh\r" on the first line and fails with a message about a file
# that plainly exists.

set -eu

INSTALL_DIR="${INSTALL_DIR:-/opt/mannabridge}"
SERVICE=mannabridge
SERVICE_USER=mannabridge
SOURCE="$(cd "$(dirname "$0")" && pwd)"

# Copied by name, never as a folder: the copy this runs from may be a
# developer's, with a live key and somebody else's punch queue beside it.
FILES="mannabridge probe.py check_push.py requirements.txt config.example.toml known_machines.toml README.md INSTALL.bat install.ps1 install.sh package.ps1"

step() { printf '\n== %s\n' "$*"; }
die() { printf '\nStopped: %s\n' "$*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
	exec sudo INSTALL_DIR="$INSTALL_DIR" sh "$0" "$@"
fi

MODE=install
case "${1:-}" in
	"") ;;
	--reconfigure) MODE=reconfigure ;;
	--status) MODE=status ;;
	--uninstall) MODE=uninstall ;;
	*) die "unknown option $1 (try --reconfigure, --status or --uninstall)" ;;
esac

# An auto-install zip (package.ps1 -Auto) carries this beside the installer:
# every answer comes from it and nothing waits for a keyboard. It holds the API
# key, so it is deleted once the key is in bridge.env.
AUTO_FILE="$SOURCE/autoinstall.toml"
AUTO=no
if [ "$MODE" = install ] && [ -f "$AUTO_FILE" ]; then
	AUTO=yes
fi

if [ "$MODE" = status ]; then
	systemctl --no-pager status "$SERVICE" || true
	exit 0
fi

if [ "$MODE" = uninstall ]; then
	systemctl disable --now "$SERVICE" 2>/dev/null || true
	rm -f "/etc/systemd/system/$SERVICE.service"
	systemctl daemon-reload
	echo "Stopped, and the service is removed. Every file is still in $INSTALL_DIR, including"
	echo "punches.sqlite3, which holds any punch not yet in ERPNext. Delete that folder only"
	echo "after the log has said \"0 waiting\"."
	exit 0
fi

command -v systemctl >/dev/null 2>&1 || die "this installer needs systemd. See README.md to run the bridge by hand."
case "$INSTALL_DIR" in
	# systemd splits ExecStart on spaces.
	*" "*) die "INSTALL_DIR cannot contain a space" ;;
esac

echo "Manna attendance bridge - installer"
echo "Installs into $INSTALL_DIR and runs at every boot."

step "Python"
python_ok() {
	"$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null
}
find_python() {
	for candidate in python3.12 python3.13 python3.11 python3; do
		if command -v "$candidate" >/dev/null 2>&1 && python_ok "$candidate"; then
			command -v "$candidate"
			return 0
		fi
	done
	return 1
}
PYTHON="$(find_python || true)"
if [ -z "$PYTHON" ] && command -v apt-get >/dev/null 2>&1; then
	apt-get update
	apt-get install -y python3 python3-venv
	PYTHON="$(find_python || true)"
fi
[ -n "$PYTHON" ] || die "Python 3.11 or newer is needed. Raspberry Pi OS bookworm and Ubuntu 22.04 or later have it."
if ! "$PYTHON" -c 'import ensurepip' 2>/dev/null; then
	# Debian ships venv's pip separately, and names the package after the version.
	if command -v apt-get >/dev/null 2>&1; then
		apt-get install -y "$(basename "$PYTHON")-venv" || apt-get install -y python3-venv
	else
		die "$PYTHON cannot make a virtual environment; install its venv package"
	fi
fi
echo "  $PYTHON"

step "Copying the bridge to $INSTALL_DIR"
systemctl stop "$SERVICE" 2>/dev/null || true
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
	useradd --system --home-dir "$INSTALL_DIR" --no-create-home \
		--shell "$(command -v nologin || echo /bin/false)" "$SERVICE_USER"
fi
mkdir -p "$INSTALL_DIR"
if [ "$SOURCE" != "$(cd "$INSTALL_DIR" && pwd)" ]; then
	for item in $FILES; do
		[ -e "$SOURCE/$item" ] || continue
		# Replaced whole, so a module an older version had cannot linger.
		rm -rf "${INSTALL_DIR:?}/$item"
		cp -R "$SOURCE/$item" "$INSTALL_DIR/$item"
	done
	find "$INSTALL_DIR/mannabridge" -name __pycache__ -type d -prune -exec rm -rf {} +
fi

step "Installing libraries"
if ! "$INSTALL_DIR/.venv/bin/python" -c 'import sys' 2>/dev/null; then
	# Missing, or built on a Python an upgrade has since removed.
	rm -rf "$INSTALL_DIR/.venv"
	"$PYTHON" -m venv "$INSTALL_DIR/.venv"
fi
"$INSTALL_DIR/.venv/bin/python" -m pip install --disable-pip-version-check --quiet -r "$INSTALL_DIR/requirements.txt" \
	|| die "could not install the libraries. This step needs the internet."
echo "  done"

cd "$INSTALL_DIR"
ASK=yes
if [ "$AUTO" = yes ]; then
	# Also on a PC already set up: it keeps its machines and adds new ones.
	.venv/bin/python -m mannabridge.wizard --auto "$AUTO_FILE" || die "automatic setup did not finish, so the bridge has not been started"
	ASK=no
elif [ -f config.toml ] && [ -f bridge.env ] && [ "$MODE" != reconfigure ]; then
	step "Setup"
	printf '  This PC is already set up. Change the key or the machines? (y/N): '
	read -r answer < /dev/tty || answer=""
	case "$answer" in
		y|Y|yes|YES) ;;
		*) ASK=no ;;
	esac
fi
if [ "$ASK" = yes ]; then
	# From the terminal even when this script came down a pipe.
	.venv/bin/python -m mannabridge.wizard < /dev/tty || die "setup did not finish, so the bridge has not been started"
fi

chown -R "$SERVICE_USER": "$INSTALL_DIR"
chmod 600 bridge.env

as_service_user() {
	if command -v runuser >/dev/null 2>&1; then
		runuser -u "$SERVICE_USER" -- "$@"
	else
		sudo -u "$SERVICE_USER" "$@"
	fi
}

step "Test: one pass now"
echo "  Reads each machine and sends new punches to ERPNext. A machine holding"
echo "  years of punches takes a minute or two to read."
echo
as_service_user .venv/bin/python -m mannabridge.main --once || true
echo
echo '  Look for "pass complete" above. "could not be read" means a machine did'
echo '  not answer; "matches no Employee" means somebody needs their Attendance'
echo '  Device ID filled in on their Employee record.'

step "Running it at every boot"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Manna attendance bridge - fingerprint machines to ERPNext
Wants=network-online.target
After=network-online.target

[Service]
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/.venv/bin/python -m mannabridge.main
# Always, not on-failure: a bridge that exits cleanly has still stopped, and a
# stopped bridge looks exactly like a workforce that stopped coming in.
Restart=always
RestartSec=30
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$SERVICE"
sleep 3
systemctl --no-pager --lines=10 status "$SERVICE" || true

if [ "$AUTO" = yes ]; then
	# Last, so an install that stopped part way can simply be run again.
	rm -f "$AUTO_FILE"
	echo "  The key file from the zip is deleted. Delete the zip too - it holds the key."
fi

echo
echo "Installed."
echo "  Check on it:     sudo sh $INSTALL_DIR/install.sh --status"
echo "  Follow the log:  journalctl -u $SERVICE -f"
echo "  Add a machine:   sudo sh $INSTALL_DIR/install.sh --reconfigure"
