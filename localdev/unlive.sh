#!/usr/bin/env bash
# Takes every live SAP company database name out of the local copy.
#
#     bash unlive.sh            rewrite, then show what is left
#     bash unlive.sh --check    only show; exit 1 if any live name remains
#
# The CMMS's SAP sync does not keep its company databases in its own config:
# it reads `sap_db` from ERPNext (`SAP Item Category Sync Control` →
# item_master_options, engineering_groups, open_po_lines; the pricing sync's
# `SAP Pricing Control` snapshot too). A restored copy of production says
# `…_LIVE` in all of them, so anything pointed at this site with SAP
# credentials would write to the live companies. Run after every restore —
# new_site.sh does.
#
#   HITECH_RUBBER_LIVE  → HITECH_RUBBER, the demo company (SAP team, 24 Oct 2026)
#   every other …_LIVE  → NOTEST_<name>, which no SAP company is called, so a
#                         sync that tries one gets "company not found"
#
# Talks to MariaDB directly, not `bench mariadb`, which needs the bench's
# Redis up and hangs without it under WSL's mirrored networking.

set -euo pipefail
cd "${BENCH_DIR:-$HOME/frappe-bench}"
SITE="${SITE:-manna.localhost}"
DB=$(python3 -c "import json; print(json.load(open('sites/$SITE/site_config.json'))['db_name'])")
q() { mariadb -u root -p"$(cat "$HOME/.frappe-db-root")" "$DB" "$@"; }

if [ "${1:-}" != "--check" ]; then
	# Quoted values only, so a word that merely contains _LIVE in prose is
	# left alone; the demo first, so the general rule cannot catch it.
	q -e "
		UPDATE tabSingles
		SET value = REGEXP_REPLACE(
			REGEXP_REPLACE(value, '\"HITECH_RUBBER_LIVE\"', '\"HITECH_RUBBER\"'),
			'\"([A-Z0-9_]+)_LIVE\"', '\"NOTEST_\\\\1\"')
		WHERE doctype LIKE 'SAP %' AND value REGEXP '\"[A-Z0-9_]+_LIVE\"';
		SELECT ROW_COUNT() AS sap_names_rewritten;

		-- Production's three webhooks post every User insert, update and
		-- delete to frappecloud.com (press.api.site_login). From the copy,
		-- that is this PC editing the live site's account records.
		UPDATE tabWebhook SET enabled = 0 WHERE enabled = 1;
		SELECT ROW_COUNT() AS webhooks_disabled;

		-- India Compliance's GST API: e-invoice and e-way bill under Manna's
		-- GSTIN. Its secret is encrypted with production's key, which the copy
		-- lacks, so it ought to fail anyway; off rather than ought to.
		UPDATE tabSingles SET value = '0'
		WHERE doctype = 'GST Settings'
		  AND field IN ('enable_api', 'enable_retry_einv_ewb_generation', 'enable_gstr_1_api', 'enable_auto_reconciliation')
		  AND value <> '0';
		SELECT ROW_COUNT() AS gst_api_switches_off;"
	# Frappe caches Singles in Redis; a stale copy would still say _LIVE.
	if timeout 3 redis-cli -p 13000 ping >/dev/null 2>&1; then
		timeout 10 redis-cli -p 13000 flushall >/dev/null && echo "bench cache cleared"
	fi
fi

LEFT=$(q -N -e "SELECT COUNT(*) FROM tabSingles WHERE doctype LIKE 'SAP %' AND value REGEXP '\"[A-Z0-9_]+_LIVE\"';")
HOOKS=$(q -N -e "SELECT COUNT(*) FROM tabWebhook WHERE enabled = 1;")
GST=$(q -N -e "SELECT COALESCE(MAX(value), '0') FROM tabSingles WHERE doctype = 'GST Settings' AND field = 'enable_api';")
MAIL=$(q -N -e "SELECT COUNT(*) FROM \`tabEmail Account\` WHERE enable_outgoing = 1 OR enable_incoming = 1;")
q -e "SELECT doctype, field, REGEXP_SUBSTR(value, '\"sap_db\": ?\"[A-Z0-9_]+\"') AS first_sap_db FROM tabSingles WHERE doctype LIKE 'SAP %' AND value LIKE '%sap_db%';"
echo "live SAP names left: $LEFT   webhooks on: $HOOKS   GST API: $GST   mail accounts on: $MAIL"
[ "$LEFT" = "0" ] && [ "$HOOKS" = "0" ] && [ "$GST" = "0" ] && [ "$MAIL" = "0" ]
