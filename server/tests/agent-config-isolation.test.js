/**
 * Agent-config isolation.
 *
 * ## The defect this gate exists for
 *
 * This repo shipped a `.clauderc` at its root whose contents belonged to a
 * DIFFERENT project on the same machine. It mandated `yarn` — while this repo
 * is npm-only, and AGENTS.md records an earlier `postinstall: cd POS && yarn
 * install` that floated versions and broke the build. It also told agents to
 * call `window.dypos.call`, a global that does not exist standalone, so an
 * agent following it wrote code whose every report fails at runtime
 * (invariant 9).
 *
 * Two rules from another project is not a style problem: an agent cannot tell
 * which sentence was written for THIS code, and both read as authoritative.
 *
 * ## Why a promise was not enough
 *
 * The file was deleted and replaced by `CLAUDE.md`, which points at
 * `AGENTS.md`. But a deleted file can come back, and the failure is silent —
 * the wrong rule is not a crash, it is confidently wrong work that compiles.
 * So the check is mechanical: this repo may not carry a second source of truth
 * for its own conventions, and no agent-config file may mandate a package
 * manager it does not use or an API global it does not expose.
 *
 * ## What this gate deliberately does NOT do
 *
 * It does not police the user's GLOBAL agent config — that is shared across
 * every project by design, and editing it from inside a repository is the very
 * coupling this gate exists to prevent. Isolation here is repository-scoped.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

/**
 * Agent-config files that would shadow or contradict `AGENTS.md` here.
 *
 * `.clauderc` is named explicitly rather than globbed: a glob would also catch
 * a backup of it, or any `.md` a human writes for humans.
 */
const AGENT_CONFIG_FILES = ['.clauderc', '.claude/settings.json', '.cursorrules'];

/** Every agent-config file that exists, with its path for the failure message. */
function presentConfigs() {
	return AGENT_CONFIG_FILES.map((rel) => {
		const path = join(REPO, rel);
		return { rel, exists: existsSync(path), text: existsSync(path) ? readFileSync(path, 'utf8') : '' };
	});
}

describe('agent-config isolation', () => {
	it('carries no second source of truth for its own conventions', () => {
		const offenders = presentConfigs()
			.filter((c) => c.exists)
			.map((c) => c.rel);
		assert.deepEqual(
			offenders,
			[],
			`AGENTS.md is the contract; these files restate or override it: ${offenders.join(', ')}`,
		);
	});

	it('points agents at AGENTS.md instead of duplicating it', () => {
		// A rules file that carries no pointer is a rules file that will drift.
		const entry = join(REPO, 'CLAUDE.md');
		assert.ok(statSync(entry).isFile(), 'CLAUDE.md is the agent entry point');
		assert.ok(readFileSync(entry, 'utf8').includes('AGENTS.md'), 'CLAUDE.md must name AGENTS.md as the contract');
	});

	it('mandates no package manager this repo does not use', () => {
		// `yarn` is not a style preference here: a yarn-based `postinstall`
		// floated versions and broke the build (AGENTS.md).
		for (const artifact of ['yarn.lock', '.yarnrc']) {
			assert.ok(!existsSync(join(REPO, artifact)), `${artifact} at the root — this repo is npm-only`);
		}
		for (const config of presentConfigs()) {
			assert.ok(!/\byarn\b/.test(config.text), `${config.rel} mandates yarn — this repo is npm-only`);
		}
	});

	it('never instructs agents to use a global this app does not expose', () => {
		// `window.dypos.call` does not exist in the standalone PWA. Code written
		// against it compiles and fails every report at runtime (invariant 9).
		for (const config of presentConfigs()) {
			assert.ok(
				!config.text.includes('window.dypos.call'),
				`${config.rel} references window.dypos.call — it does not exist standalone`,
			);
		}
	});

	it("keeps the identity documents free of another project's names", () => {
		// The measured failure mode was not an abstract rule: it was two
		// projects' vocabularies in one file. These are the sibling repos seen
		// on this machine, named so the next copy is caught at the gate.
		const SIBLING_PROJECTS = ['NexoraOS', 'ALHINIA', 'CIVORA', 'FISOP', 'GsERPCloud', 'M3ERP'];
		for (const doc of ['CLAUDE.md', 'AGENTS.md']) {
			const path = join(REPO, doc);
			if (!existsSync(path)) continue;
			const text = readFileSync(path, 'utf8');
			for (const other of SIBLING_PROJECTS) {
				assert.ok(!text.includes(other), `${doc} names the sibling project ${other} — agent config is per-project`);
			}
		}
	});
});
