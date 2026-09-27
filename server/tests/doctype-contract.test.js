/**
 * Doctype + field contract between the report layer and the method router.
 *
 * The verb-coverage gate (`check-method-coverage.mjs`) proves the POS never
 * calls a `/api/method/*` path the server does not register. It could not see
 * the next layer down, and that is where two silent lies lived:
 *
 *   1. `Sales Invoice` projected neither `base_net_total` nor
 *      `outstanding_amount`, so every report summed `undefined` and rendered a
 *      confident 0.00 against a healthy server.
 *   2. `Bin`, `Payment Entry`, `Purchase Invoice` and the movement ledger are
 *      not mapped at all, so `get_list` answers with `[]` — indistinguishable
 *      at the client from "there was none".
 *
 * This gate closes the class: for every doctype/field the report layer asks
 * for, it is either a real, mappable projection, or the report layer has
 * declared it unavailable (so it is named instead of rendered as zero).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { resolveDoctype } from '../routes/method.js';

const REPO = resolve(import.meta.dirname, '..', '..');
const REPORTS = join(REPO, 'POS', 'src', 'components', 'reports');
const read = (rel) => readFileSync(rel, 'utf8');

/** The report data layers — the modules that turn a doctype into a KPI. */
const DATA_LAYERS = [
	join(REPORTS, 'core', 'data', 'financialData.js'),
	join(REPORTS, 'core', 'data', 'pagedQuery.js'),
	join(REPORTS, 'dashboards', 'inventory', 'inventoryData.js'),
	join(REPORTS, 'dashboards', 'sales', 'salesData.js'),
	join(REPORTS, 'dashboards', 'operations', 'operationsData.js'),
	join(REPORTS, 'dashboards', 'customers', 'customersData.js'),
	join(REPORTS, 'dashboards', 'executive', 'executiveData.js'),
];

/** Human-readable name for a scanned file (POSIX separators, both platforms). */
const label = (file) => file.split(/[\\/]reports[\\/]/)[1] || file;

/** Comments explain the old bug by naming it — they must not trip the linters. */
const stripComments = (source) =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Fields declared by a named query builder, wherever its body is declared. */
function fieldsForBuilder(source, name) {
	const start = source.indexOf(`const ${name} =`);
	if (start === -1) return [];
	// Cut at the NEXT top-level declaration: a fixed-size window used to reach
	// into the following builder and attribute its fields to this doctype.
	const rest = source.slice(start);
	const end = rest.slice(1).search(/\n(?:const |let |export |function |async function )/);
	const body = end === -1 ? rest : rest.slice(0, end + 1);
	const inline = body.match(/fields:\s*\[([\s\S]*?)\]/);
	if (inline) return [...inline[1].matchAll(/"([^"]+)"/g)].map((f) => f[1]);
	// `fields: SALES_INVOICE_FIELDS` — resolve the named array in the same file.
	const named = body.match(/fields:\s*(\w+)/);
	if (!named) return [];
	const decl = source.match(new RegExp(`const\\s+${named[1]}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
	return decl ? [...decl[1].matchAll(/"([^"]+)"/g)].map((f) => f[1]) : [];
}

/** Extract the doctype → fields pairs a data layer asks the server for. */
function parseDoctypeQueries(source) {
	const code = stripComments(source);
	const out = [];
	// Two shapes exist: the query inline, and a named builder
	// (`pagedList("Sales Invoice", salesInvoiceQuery(filter))`). Both must be
	// checked, or the gate quietly checks half the layer.
	const re = /(?:pagedList|getList|collect)\(\s*"([^"]+)"\s*,\s*(\{[\s\S]*?\n\s*\}|\w+)/g;
	for (const m of code.matchAll(re)) {
		const doctype = m[1];
		let fields = [];
		if (m[2].startsWith('{')) {
			const inline = m[2].match(/fields:\s*\[([\s\S]*?)\]/);
			if (inline) fields = [...inline[1].matchAll(/"([^"]+)"/g)].map((f) => f[1]);
		} else {
			fields = fieldsForBuilder(code, m[2]);
		}
		if (doctype && fields.length) out.push({ doctype, fields });
	}
	return out;
}

/** The doctypes the client has declared it cannot read (single source of truth). */
function parseDeclaredUnavailable() {
	const src = read(join(REPORTS, 'core', 'data', 'reportDoctypes.js'));
	const block = src.match(/SERVER_UNAVAILABLE_DOCTYPES\s*=\s*new Set\(\[([\s\S]*?)\]/);
	assert.ok(block, 'SERVER_UNAVAILABLE_DOCTYPES must be declared in reportDoctypes.js');
	return new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

const queries = DATA_LAYERS.flatMap((file) =>
	parseDoctypeQueries(read(file)).map((q) => ({ ...q, file })),
);
const declaredUnavailable = parseDeclaredUnavailable();

describe('report layer ↔ method-router doctype contract', () => {
	it('finds the report queries it is supposed to check (non-vacuous)', () => {
		assert.ok(
			queries.length >= 8,
			`only ${queries.length} doctype queries parsed — the parser probably broke`,
		);
		const fields = new Set(queries.flatMap((q) => q.fields));
		// A sample of the financial facts the reports sum: if these stop being
		// parsed the gate is checking nothing.
		for (const field of ['base_net_total', 'outstanding_amount', 'valuation_rate']) {
			assert.ok(fields.has(field), `parser lost ${field}`);
		}
	});

	it('every requested field is either mapped or produced by the projection', () => {
		const problems = [];
		for (const { doctype, fields, file } of queries) {
			const spec = resolveDoctype(doctype);
			if (!spec) continue; // covered by the unavailability test below
			const produced = spec.mapRow ? Object.keys(spec.mapRow({})) : [];
			for (const field of fields) {
				if (spec.fields[field] || produced.includes(field)) continue;
				problems.push(`${doctype}.${field} (${label(file)})`);
			}
		}
		assert.deepEqual(
			problems, [],
			'these fields are neither mapped to a column nor emitted by the projection — '
				+ 'the report layer would sum undefined and render a confident zero',
		);
	});

	it('an unmapped doctype is declared unavailable, never queried as if it existed', () => {
		// Unmapped + queried = a dashboard that shows 0.00 for data the server
		// never had. The client must name it instead.
		const problems = [];
		for (const { doctype } of queries) {
			if (resolveDoctype(doctype)) continue;
			if (!declaredUnavailable.has(doctype)) {
				problems.push(doctype);
			}
		}
		assert.deepEqual(
			[...new Set(problems)], [],
			'add these to SERVER_UNAVAILABLE_DOCTYPES so the report names the gap',
		);
	});

	it('the declared-unavailable set is not stale (nothing there became mappable)', () => {
		const stale = [...declaredUnavailable].filter((d) => resolveDoctype(d) !== null);
		assert.deepEqual(
			stale, [],
			'these became mappable — remove them from SERVER_UNAVAILABLE_DOCTYPES so the data is used',
		);
	});

	it('the report layer never asks for "no limit" any more', () => {
		// `limit: 0` silently became a 50-row page and the KPIs were computed
		// from the oldest slice of the period.
		const offenders = DATA_LAYERS
			.map((file) => ({ file, source: stripComments(read(file)) }))
			.filter(({ source }) => /limit:\s*0\b/.test(source))
			.map(({ file }) => label(file));
		assert.deepEqual(offenders, [], 'use pagedList() instead of a single unbounded call');
	});
});