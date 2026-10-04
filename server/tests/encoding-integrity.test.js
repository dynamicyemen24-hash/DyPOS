/**
 * Repository-wide encoding integrity.
 *
 * This defect shipped three times in one session and every suite stayed green
 * each time, because the damage lands in comments, package descriptions and
 * Arabic literals — code that still parses and still runs. PowerShell reads
 * UTF-8 as CP1252, so a `Get-Content -Raw` → `Set-Content` round trip silently
 * rewrites an em dash as three characters and Arabic as U+FFFD.
 *
 * Two signatures are checked on every tracked text file:
 *   - U+FFFD            (Arabic re-decoded and lost)
 *   - mojibake runs     (UTF-8 read as CP1252 and written back) —
 *     spelled as escapes in MOJIBAKE below, never literally: written out they
 *     would sit in the detector's own source, and the only way to silence that
 *     is an exemption naming this file. A gate that must exempt itself can no
 *     longer report its own corruption — the one corruption that silently
 *     switches the gate off. Escapes keep it honest AND self-covered.
 *
 * `POS/src/pages/Register.vue` was exempt and deliberately NOT auto-repaired: its
 * Arabic looked multi-encoded past the point where a CP1252 reverse pass is
 * trustworthy. Repaired per non-ASCII run instead (runs that decode strictly
 * and round-trip are fixed; genuine Arabic/typography never matches the
 * reversal, so it is kept byte-identical): 176 runs fixed, 809 Arabic
 * characters, zero U+FFFD, zero remaining mojibake markers, verified by the
 * very gate that carried the exemption. The exemption is therefore dropped —
 * this file documents the repair so the next corruption is judged the same
 * way: fix the source, never grow the list.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Lockfiles are generated; a dependency's own description is not our encoding.
const LOCKFILES = new Set(['package-lock.json', 'POS/package-lock.json', 'server/package-lock.json']);
const KNOWN_UNREPAIRABLE = new Set([]);

/**
 * Mojibake signatures, spelled as UNICODE ESCAPES so this file never matches
 * itself. Written out literally they would be, in the very source of the
 * detector, the exact pattern it hunts — and the only way to silence that is
 * an exemption naming this file. A gate that has to exempt itself can no
 * longer report its own corruption, which is the one corruption that silently
 * turns the gate off. The escapes keep the check honest AND self-covered.
 *
 *   - \u00e2\u20ac      an em/en dash or curly quote re-decoded through CP1252
 *   - \u00c3.          a UTF-8 pair read as Latin-1 (\u00c3\u00a9, \u00c3\u00b1, ...)
 *   - \u00d0[\u0080-\u00bf]  the run a re-decoded Arabic block produces
 */
const MOJIBAKE = /\u00e2\u20ac|\u00c3.|\u00d0[\u0080-\u00bf]/g;

/** The same damage seen from the other side — an exempted file IS dirty. */
const DIRTY = /\u00d8|\u00d9|\u00e1\u00be/g;

const textFiles = execSync('git ls-files', { cwd: REPO, maxBuffer: 1 << 28 })
	.toString()
	.trim()
	.split('\n')
	.filter(Boolean)
	.filter((f) => /\.(js|mjs|cjs|ts|vue|json|md|yml|yaml|css|html)$/i.test(f))
	.filter((f) => !LOCKFILES.has(f) && !f.startsWith('legacy/'))
	// `git ls-files` lists the INDEX, which keeps a path after the file is
	// deleted from disk until the deletion is committed. Reading it then threw
	// ENOENT — so the gate reported a crash where it had no finding at all,
	// which is the same "cannot say nothing was checked" failure as the glob
	// that ran nothing. A file that is not on disk has no encoding to audit.
	.filter((f) => existsSync(join(REPO, f)));

describe('encoding integrity', () => {
	it('no tracked file carries U+FFFD or a CP1252 round-trip', () => {
		const offenders = [];
		for (const rel of textFiles) {
			const text = readFileSync(join(REPO, rel), 'utf8');
			const fffd = (text.match(/\uFFFD/g) || []).length;
			const moji = (text.match(MOJIBAKE) || []).length;
			if (!fffd && !moji) continue;
			if (KNOWN_UNREPAIRABLE.has(rel)) continue;
			offenders.push(`${rel} (U+FFFD=${fffd} mojibake=${moji})`);
		}
		assert.deepEqual(offenders, [], `reverse the encoding (see AGENTS.md) on:\n${offenders.join('\n')}`);
		// The scan must not have shrunk to nothing: a gate that audits zero files
		// reports the same green as one that audits all of them.
		assert.ok(textFiles.length > 100, `only ${textFiles.length} files audited — the file list collapsed`);
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
				(text.match(DIRTY) || []).length > 0,
				`${rel} is listed as unrepairable but reads clean — drop the exemption`,
			);
		}
	});
});
