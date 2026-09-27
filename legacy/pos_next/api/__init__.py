# API module for POS Next

import dypos

# Import API modules to make them accessible
from . import auth, customers, invoices, items, offers, pos_profile, promotions, shifts, utilities


@dypos.whitelist(allow_guest=True)
def ping():
	"""Simple ping endpoint for connectivity checks"""
	return "pong"
