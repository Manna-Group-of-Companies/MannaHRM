#!/usr/bin/env bash
# The local site, as a copy of the live one or as an empty one.
#
#     bash new_site.sh /mnt/c/Users/Melvin/Downloads/<backup>-database.sql.gz \
#                      [<backup>-files.tar] [<backup>-private-files.tar]
#     bash new_site.sh --fresh
#
# A copy is the one CMMS can actually be tried against: its ~40 "CMMS ..."
# doctypes exist only on the live site, as custom doctypes, and so do the
# companies, warehouses, items and logins every screen reads. A fresh site has
# none of them.
#
# Either way the site is called manna.localhost and is the bench's default, so
# http://localhost:8000 serves it and nothing needs a hosts-file entry.

set -euo pipefail

BENCH_DIR="${BENCH_DIR:-$HOME/frappe-bench}"
SITE="manna.localhost"
DB_ROOT="$(cat "$HOME/.frappe-db-root")"
export PATH="$HOME/.local/bin:$PATH"
# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh"

cd "$BENCH_DIR"
sudo service mariadb start >/dev/null
sudo service redis-server start >/dev/null || true
# The bench's own Redis, which new-site and restore clear. Not running, it is
# a 20-second hang per attempt under mirrored networking rather than an error.
for conf in redis_cache redis_queue; do
	timeout 3 redis-cli -p "$(grep -oP '^port \K\d+' "config/$conf.conf")" ping >/dev/null 2>&1 \
		|| redis-server "config/$conf.conf" --daemonize yes
done

if [ -d "sites/$SITE" ]; then
	echo "sites/$SITE already exists. To start over:" >&2
	echo "  bench drop-site $SITE --db-root-password \"\$(cat ~/.frappe-db-root)\" --force" >&2
	exit 1
fi

ADMIN_PW="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"

if [ "${1:-}" = "--fresh" ]; then
	bench new-site "$SITE" --db-root-password "$DB_ROOT" --admin-password "$ADMIN_PW"
	bench --site "$SITE" install-app erpnext
	bench --site "$SITE" install-app hrms
	bench --site "$SITE" install-app india_compliance
else
	SQL="${1:?Give the backup -database.sql.gz file, or --fresh}"
	ARGS=(--db-root-password "$DB_ROOT" --admin-password "$ADMIN_PW")
	[ -n "${2:-}" ] && ARGS+=(--with-public-files "$2")
	[ -n "${3:-}" ] && ARGS+=(--with-private-files "$3")
	# restore needs the site to exist ("manna.localhost does not exist"), so an
	# empty one first and the dump over it. --force because the dump may come
	# from a newer patch release than the bench has checked out.
	bench new-site "$SITE" --db-root-password "$DB_ROOT" --admin-password "$ADMIN_PW"
	bench --site "$SITE" restore --force "$SQL" "${ARGS[@]}"
	# The live site lists apps this bench does not have — Frappe Cloud's own
	# email_delivery_service, its mail relay — and migrate dies importing them
	# (ModuleNotFoundError). Struck off the copy's list, which is also one
	# fewer way for it to send mail.
	for app in $(echo 'SELECT defvalue FROM tabDefaultValue WHERE parent="__global" AND defkey="installed_apps";' \
			| bench --site "$SITE" mariadb -N | python3 -c 'import sys, json; print(" ".join(json.load(sys.stdin)))'); do
		if ! grep -qx "$app" sites/apps.txt; then
			echo "Removing $app from the copy (not in this bench)"
			bench --site "$SITE" remove-from-installed-apps "$app"
		fi
	done
	bench --site "$SITE" migrate
	# Live SAP company names, the Frappe Cloud webhooks, the GST API: see
	# unlive.sh. It exits non-zero if anything live is left, which stops here.
	bash "$(dirname "$0")/unlive.sh"
	# A restore brings back the live site's Administrator password; this
	# puts the one above back, so the copy's admin is not the live one's.
	bench --site "$SITE" set-admin-password "$ADMIN_PW"
fi

# What keeps a copy of production from acting like production. Every one of
# these is something the live site does on its own, on a timer or on save:
# mail to real people, the hourly leave rules, the scheduled SAP and Factor HR
# jobs. A local copy doing any of them is a second, unsupervised production.
bench --site "$SITE" set-config mute_emails 1
bench --site "$SITE" set-config pause_scheduler 1
bench --site "$SITE" set-config developer_mode 1
# Production runs 23 server scripts (cmms.api among them, and Item and File
# hooks the CMMS's saves pass through). None makes an outbound call — the SAP
# ones raise a flag the SAP server's watcher reads from production, not from
# here (checked 24 Oct 2026) — so the copy runs them, as production does.
bench set-config -g server_script_enabled 1
bench --site "$SITE" set-config allow_cors '["http://localhost:5173","http://localhost:5055"]' --parse
bench --site "$SITE" disable-scheduler
# Outgoing mail accounts would still be tried by anything that sends
# synchronously; muting covers the queue, this covers the rest.
# bench's client runs in safe-update mode, which refuses an UPDATE over the
# whole table; this one is meant to be over the whole table. No `|| true`:
# a copy still sending mail is the failure this block exists to prevent.
echo 'SET SESSION sql_safe_updates = 0; UPDATE `tabEmail Account` SET enable_outgoing = 0, enable_incoming = 0;' \
	| bench --site "$SITE" mariadb
bench use "$SITE"

echo "$ADMIN_PW" > "$HOME/.frappe-admin-$SITE"
chmod 600 "$HOME/.frappe-admin-$SITE"

cat <<EOF

Site $SITE is ready.
  Start it:        cd $BENCH_DIR && bench start
  Open it:         http://localhost:8000
  Administrator:   password in ~/.frappe-admin-$SITE
EOF
