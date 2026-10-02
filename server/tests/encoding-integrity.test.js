/**
 * Repository-wide encoding integrity.
 *
 * This defect shipped three times in one session and every suite stayed green
 * each time, because the damage lands in comments, package descriptions and
 * Arabic literals — code that still parses and still runs. PowerShell reads
 * UTF-8 as CP1252, so a `Get-Content -Raw` → `Set-Content` round trip silently
 * rewrites `—` as `â€"` and Arabic as U+FFFD.
 *
 * Two signatures are checked on every tracked text file:
 *   - U+FFFD                      (Arabic re-decoded and lost)
 *   - `â€` / `Ã.` / `Ð…` runs     (UTF-8 read as CP1252 and written back)
 *
 * `POS/src/pages/Register.vue` is exempt and deliberately NOT auto-repaired: its
 * Arabic is multi-encoded past the point where a CP1252 reverse pass is
 * trustworthy — a measured attempt turned `Ø§Ù„` into `Ø§Ù„Ù…`, making the
 * Arabic worse. It is held as named debt until someone rewrites those strings
 * from the source. Every other file must be clean, so NEW corruption still
 * fails the build.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Lockfiles are generated; a dependency's own description is not our encoding.
const LOCKFILES = new Set(['package-lock.json', 'POS/package-lock.json', 'server/package-lock.json']);
const KNOWN_UNREPAIRABLE = new Set(['POS/src/pages/Register.vue']);

const textFiles = execSync('git ls-files', { cwd: REPO, maxBuffer: 1 << 28 })
	.toString()
	.trim()
	.split('\n')
	.filter(Boolean)
	.filter((f) => /\.(js|mjs|cjs|ts|vue|json|md|yml|yaml|css|html)$/i.test(f))
	.filter((f) => !LOCKFILES.has(f) && !f.startsWith('legacy/'));

describe('encoding integrity', () => {
	it('no tracked file carries U+FFFD or a CP1252 round-trip', () => {
		const offenders = [];
		for (const rel of textFiles) {
			const text = readFileSync(join(REPO, rel), 'utf8');
			const fffd = (text.match(/\uFFFD/g) || []).length;
			const moji = (text.match(/â€|Ã.|Ð[\u0080-\u00BF]/g) || []).length;
			if (!fffd && !moji) continue;
			if (KNOWN_UNREPAIRABLE.has(rel)) continue;
			offenders.push(`${rel} (U+FFFD=${fffd} mojibake=${moji})`);
		}
		assert.deepEqual(offenders, [], `reverse the encoding (see AGENTS.md) on:\n${offenders.join('\n')}`);
	});

	it('the exemption list stays tiny and every entry is still dirty', () => {
		// An exemption is a decision, not a dump: if the file is ever repaired the
		// entry must go, and the list must never quietly become a blanket.
		assert.ok(
			KNOWN_UNREPAIRABLE.size <= 2,
			`${KNOWN_UNREPAIRABLE.size} files bypass the encoding gate — repair them instead of growing the list`,
		);
		for (const rel of KNOWN_UNREPAIRABLE) {
			const text = readFileSync(join(REPO, rel), 'utf8');
			assert.ok(
				(text.match(/Ø|Ù|á¾/g) || []).length > 0,
				`${rel} is listed as unrepairable but reads clean — drop the exemption`,
			);
		}
	});
});
