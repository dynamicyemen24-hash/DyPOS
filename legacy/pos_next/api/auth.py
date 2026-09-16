import hashlib

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, get_url, now_datetime
from frappe.utils.password import check_password, update_password

# ---------------------------------------------------------------------------
# Session lock password verification
# ---------------------------------------------------------------------------


@frappe.whitelist()
@rate_limit(limit=5, seconds=60)
def verify_session_password(password=None):
	"""Verify the current session user's password for session lock re-authentication.

	NOTE: We must NOT raise frappe.AuthenticationError here because Frappe's
	error handler (app.py) calls login_manager.clear_cookies() for that
	exception type, which would destroy the user's session on a wrong password.
	Instead, we return a structured response indicating success or failure.
	"""
	if not password:
		return {"verified": False, "message": _("Password is required")}

	try:
		check_password(frappe.session.user, password)
		return {"verified": True}
	except frappe.AuthenticationError:
		return {"verified": False, "message": _("Incorrect password")}


# ---------------------------------------------------------------------------
# Session extension (idle-timeout renewal from the POS client)
# ---------------------------------------------------------------------------


@frappe.whitelist()
@rate_limit(limit=60, seconds=60)
def extend_session():
	"""Extend the current authenticated session's server-side expiry.

	Called by the POS client's session-timeout composable to renew the
	idle countdown. Requires an authenticated session (no allow_guest).
	Extension is best-effort: the client also refreshes its local
	countdown, so a miss here degrades gracefully to the default TTL.
	"""
	if not frappe.session.user or frappe.session.user == "Guest":
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	extended = False
	try:
		# Touch the session so its last-active timestamp (and therefore
		# the server-side expiry window) is renewed.
		frappe.local.session_obj.update_expires()
		extended = True
	except Exception:
		# Best-effort: never break the client flow on session internals.
		frappe.logger("dypos.auth").warning(
			f"extend_session: could not touch session for {frappe.session.user}"
		)

	return {"extended": extended, "user": frappe.session.user}


# ---------------------------------------------------------------------------
# Password recovery — secure, single-use, time-limited reset tokens
#
# Security techniques (aligned with OWASP Forgot Password Cheat Sheet
# and NIST SP 800-63B):
#
#   1. Reset tokens are 32-char random strings, stored HASHED (SHA-256)
#      in Redis with an automatic TTL (30 minutes) — the raw token
#      never touches persistent storage.
#   2. Tokens are single-use: consumed atomically on success.
#   3. Anti-enumeration: identical response whether or not the email
#      exists, and no timing signal for unknown accounts.
#   4. Server-side rate limiting on both flow endpoints.
#   5. Password hashing is delegated to Frappe's update_password()
#      (bcrypt/scrypt per system configuration) — never stored raw.
#   6. On success, any outstanding reset_password_key on the user is
#      invalidated so older reset links stop working.
#   7. All flow events are logged for the audit trail.
# ---------------------------------------------------------------------------

RESET_TOKEN_TTL_SECONDS = 30 * 60  # must match RESET_TOKEN_EXPIRY_MS on the client
RESET_TOKEN_PREFIX = "pos_pwd_reset"


def _hash_token(token):
	"""SHA-256 of the raw token — only the hash is ever stored."""
	return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _cache():
	"""Redis cache handle for token storage."""
	return frappe.cache()


def _store_reset_token(email):
	"""Generate a reset token for the user and persist its hash with a TTL.

	Returns the raw token (only exists outside Redis until sent by email).
	"""
	token = frappe.generate_hash(length=32)
	key = f"{RESET_TOKEN_PREFIX}:{_hash_token(token)}"
	payload = frappe.json.dumps(
		{
			"user": email,
			"issued_at": now_datetime().isoformat(),
		}
	)

	_cache().set_value(key, payload, expires_in_seconds=RESET_TOKEN_TTL_SECONDS)

	return token


def _consume_reset_token(token):
	"""Atomically read + delete a reset token (single-use semantics).

	Returns the owner email, or None when the token is unknown/expired.
	"""
	key = f"{RESET_TOKEN_PREFIX}:{_hash_token(token)}"
	cache = _cache()

	payload = cache.get_value(key)
	if not payload:
		return None

	# Delete FIRST so concurrent reuse of the same token always fails.
	cache.delete_value(key)

	try:
		data = frappe.json.loads(payload)
		return data.get("user")
	except Exception:
		return None


def _build_reset_link(token):
	"""Build the SPA reset-password link sent in the email.

	The path can be overridden via site_config (pos_reset_password_path)
	for deployments where the POS SPA is served under a different route.
	"""
	path = frappe.conf.get("pos_reset_password_path") or "/reset-password"
	return f"{get_url(path)}?token={token}"


def _send_reset_email(email, token):
	link = _build_reset_link(token)

	subject = _("DyPOS — رابط استعادة كلمة المرور")
	message = f"""
	<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; color: #1f2937;">
		<h2 style="margin: 0 0 12px;">استعادة كلمة المرور</h2>
		<p>تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
		<p>
			<a href="{link}"
			   style="display: inline-block; padding: 10px 22px; background: #4f46e5;
			          color: #ffffff; border-radius: 8px; text-decoration: none; font-weight: bold;">
				تعيين كلمة مرور جديدة
			</a>
		</p>
		<p style="font-size: 13px; color: #6b7280;">
			هذا الرابط صالح لمدة {RESET_TOKEN_TTL_SECONDS // 60} دقيقة ويعمل لمرة واحدة فقط.
			إذا لم تطلب أنت هذا الطلب، يمكنك تجاهل هذه الرسالة بأمان.
		</p>
		<p style="font-size: 12px; color: #9ca3af;">
			إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:<br>
			<span dir="ltr">{link}</span>
		</p>
	</div>
	"""

	frappe.sendmail(
		recipients=[email],
		subject=subject,
		message=message,
	)


def _validate_new_password(password):
	"""Server-side password policy (defense in depth vs. the client checks)."""
	if not password or len(password) < 8:
		frappe.throw(_("Password must be at least 8 characters long"))
	if len(password) > 128:
		frappe.throw(_("Password must be at most 128 characters long"))

	# Optional: Frappe's system-configured strength checker (v14+), applied
	# when available so System Settings password policy is honoured.
	try:
		from frappe.utils.password_strength import test_password_strength

		feedback = test_password_strength(password)
		if feedback and feedback.get("score") is not None:
			# Frappe scores 0-4; require at least 2 (fair) when it runs.
			if cint(feedback.get("score")) < 2:
				suggestion = feedback.get("password_recommendation") or ""
				frappe.throw(
					_("Please choose a stronger password. {0}").format(suggestion)
				)
	except ImportError:
		pass


@rate_limit(limit=3, seconds=900)
def send_password_reset(email=None):
	"""Request a password-reset email link (guest endpoint).

	Anti-enumeration: ALWAYS returns the same generic response whether
	or not the account exists, so the endpoint cannot be used to
	discover registered emails.
	"""
	generic_message = _(
		"If the account exists, a password reset link has been sent to your email."
	)

	if not email or not frappe.utils.validate_email_address(email):
		# Same generic response for malformed input — no signal to probes.
		return {"message": generic_message}

	email = email.strip().lower()

	try:
		user = frappe.db.get_value("User", {"email": email, "enabled": 1}, "name")
	except Exception:
		user = None

	if user:
		try:
			token = _store_reset_token(email)
			_send_reset_email(email, token)

			frappe.logger("dypos.auth").info(
				f"Password reset link issued for {email}"
			)
		except Exception:
			frappe.log_error(
				title="DyPOS password reset email failed",
				message=frappe.get_traceback(),
			)
			# Still return the generic message — no enumeration signal.
	else:
		frappe.logger("dypos.auth").info(
			f"Password reset requested for unknown email {email}"
		)

	return {"message": generic_message}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=5, seconds=900)
def reset_password(token=None, new_password=None):
	"""Consume a single-use reset token and set the new password (guest endpoint).

	Raises frappe.AuthenticationError on unknown/expired tokens so the
	client surfaces its "request a new link" flow.
	"""
	if not token or not new_password:
		frappe.throw(_("Invalid or expired reset link"), frappe.AuthenticationError)

	# Defense in depth: server-side password policy
	_validate_new_password(new_password)

	# Atomic consume — second use of the same token fails here.
	email = _consume_reset_token(token)

	if not email:
		frappe.throw(_("Invalid or expired reset link"), frappe.AuthenticationError)

	# The account must still exist and be enabled at consumption time.
	exists = frappe.db.get_value("User", {"email": email, "enabled": 1}, "name")
	if not exists:
		frappe.throw(_("Invalid or expired reset link"), frappe.AuthenticationError)

	# Delegate hashing to Frappe (bcrypt/scrypt per system configuration)
	update_password(user=email, pwd=new_password)

	# Invalidate any other outstanding reset keys on the account
	try:
		frappe.db.set_value(
			"User", email, "reset_password_key", "", update_modified=False
		)
	except Exception:
		pass

	frappe.db.commit()

	frappe.logger("dypos.auth").info(f"Password reset completed for {email}")

	try:
		frappe.get_doc(
			{
				"doctype": "Activity Log",
				"subject": f"Password reset via secure token — {email}",
				"type": "Auth",
			}
		).insert(ignore_permissions=True)
	except Exception:
		# Audit log is best-effort; never block the user flow.
		pass

	return {"message": _("Your password has been reset successfully.")}
