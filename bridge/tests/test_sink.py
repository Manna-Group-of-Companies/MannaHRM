"""What the site's answer to one punch means for the queue.

No network: the session's post is replaced, because the rules here are about
reading an answer, not about sending one.
"""

import pytest
from mannabridge.sink import DeliveryError, ErpSink, UnmappedEmployee


class Answer:
	def __init__(self, status, text="", message=None):
		self.status_code = status
		self.text = text
		self._message = message

	def json(self):
		return {"message": self._message or {}}


def sink_answering(answer):
	sink = ErpSink("https://site.example", "key", "secret")
	sink._session.post = lambda *a, **k: answer
	return sink


def send(sink):
	return sink.send(device_user="516", punched_at="2026-09-12 15:19:26", device_id="BIO-MRP-GATE1", log_type="OUT")


def test_a_punch_the_site_already_has_counts_as_delivered():
	# Two bridges overlapping, or a laptop that filled in while the box was off.
	# Raising here stopped every pass at the first overlap and the bridge that
	# was behind never caught up.
	body = '{"exception": "frappe.exceptions.ValidationError: This employee already has a log with the same timestamp."}'
	assert send(sink_answering(Answer(417, body))) == {}


def test_a_device_user_nobody_is_linked_to_is_not_retried():
	with pytest.raises(UnmappedEmployee):
		send(sink_answering(Answer(417, "No Employee found for the given employee field value")))


def test_a_refused_key_is_loud_rather_than_retried_in_silence():
	with pytest.raises(DeliveryError, match="authentication refused"):
		send(sink_answering(Answer(401, "")))


def test_any_other_refusal_is_still_a_failure():
	with pytest.raises(DeliveryError):
		send(sink_answering(Answer(500, "Internal Server Error")))


def test_a_delivered_punch_hands_back_what_the_site_made():
	assert send(sink_answering(Answer(200, message={"name": "EMP-CKIN-1"}))) == {"name": "EMP-CKIN-1"}


class Listing:
	def __init__(self, data):
		self._data = data

	def json(self):
		return {"data": self._data}


class Site:
	"""Shift Types with a last_sync_of_checkin each, and a record of what got written."""

	def __init__(self, shifts):
		self.shifts = shifts
		self.writes = {}

	def get(self, url, params=None, timeout=None):
		return Listing([{"name": n, "last_sync_of_checkin": v} for n, v in self.shifts.items()])

	def put(self, url, json=None, timeout=None):
		self.writes[url.rsplit("/", 1)[-1]] = json["last_sync_of_checkin"]


def sink_on(site):
	sink = ErpSink("https://site.example", "key", "secret")
	sink._session.get = site.get
	sink._session.put = site.put
	return sink


def test_the_sync_marker_never_moves_backwards():
	# Measured on 14 Sep 2026: J1800 had it at Saturday 15:19, the laptop filling
	# in wrote Friday 20:31 over it, and Saturday's shifts stopped closing.
	site = Site({"Office": "2026-09-12 15:19:26"})
	assert sink_on(site).mark_synced("https://site.example", "2026-09-11 20:31:07") == 0
	assert site.writes == {}


def test_the_sync_marker_moves_forward():
	site = Site({"Office": "2026-09-12 15:19:26"})
	assert sink_on(site).mark_synced("https://site.example", "2026-09-14 08:29:39") == 1
	assert site.writes == {"Office": "2026-09-14 08:29:39"}


def test_a_shift_that_was_never_synced_gets_its_first_marker():
	site = Site({"Office": None})
	assert sink_on(site).mark_synced("https://site.example", "2026-09-14 08:29:39") == 1


def test_a_connection_the_site_dropped_is_retried_even_for_a_post():
	# The first send after a long read of the machine met a closed keep-alive
	# and stopped the pass, every pass. Safe to retry a POST only because a
	# duplicate now counts as delivered.
	retry = ErpSink("https://site.example", "key", "secret")._session.get_adapter("https://site.example").max_retries
	assert "POST" in retry.allowed_methods
	assert retry.read and retry.connect
