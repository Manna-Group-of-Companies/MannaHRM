"""Let the bench-free suite run on a machine with no `frappe` on it.

`CLAUDE.md` §3 says these tests need no bench, and that is true of all but one
of them: `test_assets.py` imports `manna_hr.assets`, which imports `frappe` at
the top because nearly every function in it touches a site.

Without this, that single import ends **collection** — pytest stops before it
runs anything, and 470-odd tests that need nothing report as one error about a
missing module. Skipping the module keeps the rest honest: the file is still
collected the moment somebody runs the suite inside a bench, and the skip says
which tests were not run rather than quietly reporting green.
"""

import pytest

try:
	import frappe  # noqa: F401

	HAS_BENCH = True
except ImportError:
	HAS_BENCH = False

collect_ignore = [] if HAS_BENCH else ["test_assets.py"]


def pytest_report_header(config):
	if not HAS_BENCH:
		return "manna_hr: no `frappe` here, so test_assets.py is not collected — run it in a bench"
	return None
