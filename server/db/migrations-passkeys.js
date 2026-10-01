/**
 * v32 — WebAuthn (FIDO2) passkey credentials for biometric login.
 *
 * Face/fingerprint never reaches this system: the OS authenticator does the
 * matching inside the secure enclave and returns a public-key signature.
 * We store the COSE public key and the monotonic signature counter, so a
 * cloned authenticator (a replayed counter) is rejected.
 *
 * Both tables carry `tenant_id` because every read path is tenant fail-closed:
 * a spoofed tenant is a 403, a foreign row is a 404 — never an unscoped scan.
 * `passkey_challenges` is single-use by primary key and expires fast, so a
 * captured challenge cannot be replayed into an assertion.
 */
export function migratePasskeys(
	db,
	addColumnIfMissing,
	{ version = 32, description = "webauthn passkey credentials" } = {},
) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      tenant_id TEXT,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      algorithm INTEGER NOT NULL DEFAULT -7,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      device_label TEXT,
      aaguid TEXT,
      backed_up INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkey_credentials(user_id);
    CREATE TABLE IF NOT EXISTS passkey_challenges (
      challenge TEXT PRIMARY KEY,
      user_id TEXT,
      tenant_id TEXT,
      purpose TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_passkey_challenges_exp ON passkey_challenges(expires_at);
  `);
	db.prepare(
		"INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)",
	).run(version, description);
	return version;
}

export default migratePasskeys;
