# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

import dypos
from dypos.model.document import Document
from dypos.utils import cint, flt


class POSSettings(Document):
	def validate(self):
		"""Validate POS Settings"""
		# Guard against None values and validate discount percentage
		max_discount = flt(self.max_discount_allowed)
		if max_discount < 0 or max_discount > 100:
			dypos.throw("Max Discount Allowed must be between 0 and 100")

		# Guard against None values and validate search limit
		if self.use_limit_search:
			search_limit = cint(self.search_limit)
			if search_limit <= 0:
				dypos.throw("Search Limit must be greater than 0")

		# Validate use_exact_amount cannot be enabled with credit sale or partial payment
		if cint(self.use_exact_amount):
			if cint(self.allow_credit_sale):
				dypos.throw(
					"'Use Exact Amount for Non-Cash' cannot be enabled together with 'Allow Credit Sale'. "
					"Please disable Credit Sale first."
				)
			if cint(self.allow_partial_payment):
				dypos.throw(
					"'Use Exact Amount for Non-Cash' cannot be enabled together with 'Allow Partial Payment'. "
					"Please disable Partial Payment first."
				)

	def on_update(self):
		"""Sync allow_negative_stock with Stock Settings"""
		self.sync_negative_stock_setting()

	def sync_negative_stock_setting(self):
		"""
		Synchronize allow_negative_stock with Stock Settings.

		When enabled in POS Settings, it enables the global Stock Settings.
		When disabled, it only disables global Stock Settings if no other
		POS Settings have it enabled.

		Note: Runs in the same transaction as the save, no manual commits.
		"""
		current_stock_setting = cint(
			dypos.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
		)

		if cint(self.allow_negative_stock):
			# Enable Stock Settings if not already enabled
			if not current_stock_setting:
				dypos.db.set_single_value("Stock Settings", "allow_negative_stock", 1, update_modified=False)
				dypos.msgprint(
					"Stock Settings 'Allow Negative Stock' has been automatically enabled.",
					indicator="green",
					alert=True,
				)
		else:
			# Only disable if no other enabled POS Settings have it enabled
			if current_stock_setting:
				# Use count for better performance and clarity
				other_enabled_count = dypos.db.count(
					"POS Settings",
					{
						"allow_negative_stock": 1,
						"enabled": 1,  # Only check enabled POS Settings
						"name": ["!=", self.name],
					},
				)

				if other_enabled_count == 0:
					dypos.db.set_single_value(
						"Stock Settings", "allow_negative_stock", 0, update_modified=False
					)
					dypos.msgprint(
						"Stock Settings 'Allow Negative Stock' has been automatically disabled.",
						indicator="orange",
						alert=True,
					)


@dypos.whitelist()
def get_pos_settings(pos_profile):
	"""
	Get POS Settings for a specific POS Profile.

	Also injects the current global Stock Settings value to show the actual
	source of truth, preventing confusion when the checkbox appears enabled
	but the global setting was changed elsewhere.
	"""
	from dyposimport _

	if not pos_profile:
		return None

	# Check if user has access to this POS Profile
	has_access = dypos.db.exists("POS Profile User", {"parent": pos_profile, "user": dypos.session.user})

	if not has_access and not dypos.has_permission("POS Settings", "read"):
		dypos.throw(_("You don't have access to this POS Profile"))

	settings = dypos.db.get_value("POS Settings", {"pos_profile": pos_profile}, "*", as_dict=True)

	# If no settings exist, create default settings
	if not settings:
		settings = create_default_settings(pos_profile)

	# Inject the current global Stock Settings value for transparency
	# This helps UI reflect the actual state even if multiple POS Settings exist
	settings["_global_allow_negative_stock"] = cint(
		dypos.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
	)

	return settings


def create_default_settings(pos_profile):
	"""Create default POS Settings for a POS Profile"""
	doc = dypos.new_doc("POS Settings")
	doc.pos_profile = pos_profile
	doc.enabled = 1
	doc.insert()

	return doc.as_dict()


@dypos.whitelist()
def update_pos_settings(pos_profile, settings):
	"""Update POS Settings for a POS Profile"""
	import json

	from dyposimport _

	if isinstance(settings, str):
		settings = json.loads(settings)

	# Check if user has access to this POS Profile
	has_access = dypos.db.exists("POS Profile User", {"parent": pos_profile, "user": dypos.session.user})

	if not has_access and not dypos.has_permission("POS Settings", "write"):
		dypos.throw(_("You don't have permission to update this POS Profile"))

	# Check if settings exist
	existing = dypos.db.exists("POS Settings", {"pos_profile": pos_profile})

	if existing:
		doc = dypos.get_doc("POS Settings", existing)
		doc.update(settings)
		doc.save()
	else:
		doc = dypos.new_doc("POS Settings")
		doc.pos_profile = pos_profile
		doc.update(settings)
		doc.insert()

	return doc.as_dict()
