# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt


import json

import dypos
from dyposimport _
from dypos.utils import cint


@dypos.whitelist()
def get_csrf_token():
	"""
	Get CSRF token for the current session.
	Only returns CSRF token if user is authenticated with a valid session.

	Security checks:
	- User must be authenticated (not Guest)
	- Session must be valid
	- User must be enabled
	"""
	if dypos.session.user == "Guest":
		dypos.throw(_("Authentication required"), dypos.AuthenticationError)

	if not dypos.db.get_value("User", dypos.session.user, "enabled"):
		dypos.throw(_("User is disabled"), dypos.AuthenticationError)

	if not dypos.session.sid or dypos.session.sid == "Guest":
		dypos.throw(_("Invalid session"), dypos.AuthenticationError)

	csrf_token = dypos.sessions.get_csrf_token()

	if not csrf_token:
		dypos.throw(_("Failed to generate CSRF token"), dypos.ValidationError)

	return {"csrf_token": csrf_token, "session_id": dypos.session.sid}


def _parse_list_parameter(value, param_name="parameter"):
	"""
	Parse a list parameter that may come as JSON string or list.

	Args:
		value: Value to parse (string or list)
		param_name: Name of parameter for error messages

	Returns:
		list: Parsed list value
	"""
	if isinstance(value, str):
		try:
			value = value.strip()
			return json.loads(value) if value else []
		except json.JSONDecodeError as e:
			dypos.throw(_("Could not parse '{0}' as JSON: {1}").format(param_name, str(e)))

	if not isinstance(value, list):
		return []

	return value


def check_user_company():
	"""Check if the authenticated user has a company linked to them."""
	user = dypos.session.user

	permission = dypos.db.get_value(
		"User Permission", {"user": user, "allow": "Company"}, ["for_value"], as_dict=True
	)

	if permission:
		company_name = dypos.db.get_value("Company", permission.for_value, "company_name")
		return {"has_company": True, "company": company_name or ""}

	return {"has_company": False, "company": ""}


def get_wallet_payment_modes():
	"""
	Get list of Mode of Payment names that are marked as wallet payments.

	Returns:
		list: List of Mode of Payment names with is_wallet_payment=1
	"""
	return dypos.get_all("Mode of Payment", filters={"is_wallet_payment": 1}, pluck="name")


def is_wallet_payment_mode(mode_of_payment):
	"""
	Check if a Mode of Payment is a wallet payment.

	Args:
		mode_of_payment: Mode of Payment name

	Returns:
		bool: True if the mode is a wallet payment
	"""
	if not mode_of_payment:
		return False

	return cint(dypos.get_cached_value("Mode of Payment", mode_of_payment, "is_wallet_payment"))
