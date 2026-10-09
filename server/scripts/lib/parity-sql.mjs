/**
 * Quote-aware SQL text primitives shared by the SQLite→Postgres parity pair:
 *   - scripts/check-pg-parity.mjs  (the CI gate — names only)
 *   - scripts/gen-pg-parity.mjs   (the generator — names, types, defaults)
 * One reader for both (S3): if "how we read DDL" changes, the gate and the
 * generator change together, so the generator can never satisfy the gate with
 * an interpretation the gate does not share.
 *
 * Two failure modes this file exists to prevent, both measured on this pack:
 *   1. A comma inside a string literal at paren-depth 0 —
 *      `DEFAULT '#,###.##'` (countries.number_format) — cut the column part
 *      in half, so the NEXT column never appeared as a first token and parity
 *      reported a column that was present. Splitting is quote-aware.
 *   2. Commas inside `--` prose (`-- 'latn' or 'arab'`) split table bodies
 *      the same way. Comments are stripped before any parse.
 * Balanced-paren scanning is quote-aware for the same class of reason:
 * a string containing `)` must not end a table body early.
 */

/** Remove `-- …` line comments; quote-aware so `--` inside a literal survives. */
export function stripLineComments(sql) {
	let out = '';
	let q = null;
	for (let i = 0; i < sql.length; i++) {
		const ch = sql[i];
		if (q) {
			out += ch;
			if (ch === q) {
				if (sql[i + 1] === q) {
					out += sql[i + 1];
					i++;
				} else q = null;
			}
			continue;
		}
		if (ch === "'" || ch === '"') {
			q = ch;
			out += ch;
			continue;
		}
		if (ch === '-' && sql[i + 1] === '-') {
			while (i < sql.length && sql[i] !== '\n') i++;
			out += '\n';
			continue;
		}
		out += ch;
	}
	return out;
}

/**
 * Index of the `)` matching the `(` at `start`, or -1. Quote-aware: a `)`
 * inside a string literal does not close the group.
 */
export function matchParen(sql, start) {
	let depth = 0;
	let q = null;
	for (let i = start; i < sql.length; i++) {
		const ch = sql[i];
		if (q) {
			if (ch === q) {
				if (sql[i + 1] === q) {
					i++;
					continue;
				}
				q = null;
			}
			continue;
		}
		if (ch === "'" || ch === '"') {
			q = ch;
			continue;
		}
		if (ch === '(') depth++;
		else if (ch === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/** Inner body of a `CREATE TABLE … (` statement: everything between the outer parens. */
export function tableBodyOf(createSql) {
	const open = createSql.indexOf('(');
	if (open === -1) return '';
	const close = matchParen(createSql, open);
	if (close === -1) return '';
	return createSql.slice(open + 1, close);
}

/** Split a table body on commas at paren-depth 0, never inside a string literal. */
export function splitTopParts(body) {
	const parts = [];
	let cur = '';
	let depth = 0;
	let q = null;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (q) {
			cur += ch;
			if (ch === q) {
				if (body[i + 1] === q) {
					cur += body[i + 1];
					i++;
				} else q = null;
			}
			continue;
		}
		if (ch === "'" || ch === '"') {
			q = ch;
			cur += ch;
			continue;
		}
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(cur);
			cur = '';
			continue;
		}
		cur += ch;
	}
	if (cur.trim()) parts.push(cur);
	return parts;
}

/** Split on whitespace at paren-depth 0 — `'a b'` and `NUMERIC(10, 2)` stay one token. */
export function tokenize(s) {
	const out = [];
	let cur = '';
	let depth = 0;
	let q = null;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (q) {
			cur += ch;
			if (ch === q) {
				if (s[i + 1] === q) {
					cur += s[i + 1];
					i++;
				} else q = null;
			}
			continue;
		}
		if (ch === "'" || ch === '"') {
			q = ch;
			cur += ch;
			continue;
		}
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (/\s/.test(ch) && depth === 0) {
			if (cur) out.push(cur);
			cur = '';
			continue;
		}
		cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}

const STOP_RE = /^(PRIMARY|NOT|NULL|DEFAULT|UNIQUE|CHECK|REFERENCES|COLLATE|GENERATED|CONSTRAINT|AUTOINCREMENT)$/i;

/**
 * True when a top-level part is a table constraint, not a column. Tested on
 * the RAW part because `UNIQUE(tenant_id, code)` glues the head keyword to
 * its paren — tokenizing first would report a column literally named
 * `UNIQUE(tenant_id,`.
 */
export const isConstraintHead = (part) => /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(part.trim());

/**
 * Split one top-level table part into { name, type, restTokens }.
 * `type` runs from after the name up to the first constraint keyword at
 * depth 0; `restTokens` is everything after that (NOT NULL, DEFAULT, …).
 * Table constraints are filtered by callers with isConstraintHead(part) —
 * a `FOREIGN KEY (…)` part's `type` is meaningless, which is fine: it is
 * never used.
 */
export function splitColDef(part) {
	const toks = tokenize(part.trim());
	if (!toks.length) return null;
	let stop = 1;
	while (stop < toks.length && !STOP_RE.test(toks[stop])) stop++;
	return {
		name: toks[0].replace(/^["'`[]|["'`\]]$/g, ''),
		type: toks.slice(1, stop).join(' '),
		restTokens: toks.slice(stop),
	};
}

/**
 * Parse a schema-postgres.sql text into { tables, indexes }.
 *   tables  : Map<table, Map<column, declared type>>  (CREATE bodies + ALTER ADD COLUMN)
 *   indexes : Set<index name>
 * Schema-qualified `dypos.x` statements are intentionally NOT counted — the
 * gate compares against the unqualified SQLite names (the pack's own
 * baseline convention, e.g. `currencies` exists both ways).
 */
export function parsePgObjects(sql) {
	const clean = stripLineComments(sql);
	const tables = new Map();
	const indexes = new Set();

	const addTable = (name) => {
		const key = name.toLowerCase();
		if (!tables.has(key)) tables.set(key, new Map());
		return tables.get(key);
	};

	for (const m of clean.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(/gi)) {
		const open = clean.indexOf('(', m.index);
		const close = matchParen(clean, open);
		if (close === -1) continue;
		const cols = addTable(m[1]);
		for (const part of splitTopParts(clean.slice(open + 1, close))) {
			const def = splitColDef(part);
			if (!def || isConstraintHead(part)) continue;
			const key = def.name.toLowerCase();
			if (!cols.has(key)) cols.set(key, def.type);
		}
	}

	for (const m of clean.matchAll(
		/ALTER TABLE\s+([a-z_][a-z0-9_]*)\s+ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s+([^;]*);/gi,
	)) {
		const cols = addTable(m[1]);
		const key = m[2].toLowerCase();
		if (cols.has(key)) continue;
		const def = splitColDef(m[3]);
		cols.set(key, def ? def.type : '');
	}

	for (const m of clean.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
		indexes.add(m[1].toLowerCase());
	}

	return { tables, indexes };
}
