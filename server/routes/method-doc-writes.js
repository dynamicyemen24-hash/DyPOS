/**
 * The doctype write plane — set_value / insert / delete_doc — extracted from
 * routes/method.js under the file-size ratchet (server/tests/fileSize.test.js).
 *
 * One module owns all three because they share one security contract: role
 * gate (ADMIN/MANAGER or the permission matrix), doctype resolution, tenant
 * guard (assertMethodRecordTenant), field mapping through spec.fields only,
 * and mapErrorStatus'd failures. A fourth write path that skipped the guard
 * would be a tenant leak, so they live together and are registered together.
 *
 * `def` and the router's helpers are injected: this file imports nothing
 * itself, which keeps the dependency direction (router → writers) acyclic.
 */
export function registerDocWriteHandlers(def, deps) {
	const {
		db,
		requireUser,
		methodError,
		resolveDoctype,
		tenantColumnKnown,
		resolveTenantFilter,
		idLookupWhere,
		assertMethodRecordTenant,
		mapErrorStatus,
		redactRow,
		checkPermission,
	} = deps;

	def('dypos.client.set_value', (params, req, res) => {
		if (!requireUser(req, res)) return;
		const role = req.user.role;
		if (!['ADMIN', 'MANAGER'].includes(role) && !checkPermission(role, params.doctype, 'write')) {
			return methodError(res, 403, 'PermissionError', 'صلاحية غير كافية');
		}
		const spec = resolveDoctype(params.doctype);
		if (!spec) return methodError(res, 404, 'NotFoundError', 'غير موجود');
		const name = String(params.name || '').trim();
		if (!name) return methodError(res, 400, 'ValidationError', 'المعرف مطلوب');
		if (!assertMethodRecordTenant(req, res, spec, name)) return;
		const fieldname = params.fieldname;
		let values = {};
		if (fieldname && typeof fieldname === 'object' && !Array.isArray(fieldname)) {
			values = fieldname;
		} else if (typeof fieldname === 'string' && params.value !== undefined) {
			values = { [fieldname]: params.value };
		} else if (Array.isArray(fieldname) && params.value !== undefined) {
			// array form: fieldname can be single or we expect object value
			values = { [fieldname[0]]: params.value };
		}
		const sets = [];
		const sqlParams = [];
		for (const [k, v] of Object.entries(values)) {
			const col = spec.fields[k] || (spec.idAliases?.includes(k) ? spec.idCol : null);
			if (!col || col === spec.idCol) continue;
			sets.push(`${col}=?`);
			sqlParams.push(v);
		}
		if (!sets.length) return methodError(res, 400, 'ValidationError', 'لا حقول للتحديث');
		const { where, count } = idLookupWhere(spec);
		try {
			const upd = db
				.prepare(`UPDATE ${spec.table} SET ${sets.join(', ')} WHERE ${where}`)
				.run(...sqlParams, ...Array(count).fill(name));
			if (!upd.changes) return methodError(res, 404, 'NotFoundError', 'غير موجود');
			const row = db.prepare(`SELECT * FROM ${spec.table} WHERE ${where} LIMIT 1`).get(...Array(count).fill(name));
			const saved = spec.mapRow ? spec.mapRow(row) : redactRow(spec, row);
			return res.json({ message: saved });
		} catch (e) {
			return methodError(res, mapErrorStatus(e), 'ValidationError', String(e.message || 'فشل التحديث').slice(0, 200));
		}
	});

	def('dypos.client.insert', (params, req, res) => {
		if (!requireUser(req, res)) return;
		const role = req.user.role;
		if (!['ADMIN', 'MANAGER'].includes(role) && !checkPermission(role, params.doctype, 'create')) {
			return methodError(res, 403, 'PermissionError', 'صلاحية غير كافية');
		}
		const spec = resolveDoctype(params.doctype);
		if (!spec) return methodError(res, 404, 'NotFoundError', 'غير موجود');
		const raw =
			params.values && typeof params.values === 'object' && !Array.isArray(params.values)
				? params.values
				: params.fieldname && typeof params.fieldname === 'object' && !Array.isArray(params.fieldname)
					? params.fieldname
					: null;
		if (!raw) return methodError(res, 400, 'ValidationError', 'لا قيم للإدراج');
		const cols = [];
		const sqlParams = [];
		for (const [k, v] of Object.entries(raw)) {
			const col = spec.fields[k] || (spec.idAliases?.includes(k) ? spec.idCol : null);
			if (!col) return methodError(res, 400, 'ValidationError', `حقل غير معروف: ${String(k).slice(0, 40)}`);
			cols.push(col);
			sqlParams.push(v);
		}
		// Record id: an explicit `name` wins; a `name`-mapped field already landed
		// in cols (mkRef sets fields.name = idCol); otherwise the `code` value is
		// the id (v53's convention: id = code where a code exists).
		if (!cols.includes(spec.idCol)) {
			const codeKey = Object.keys(raw).find((k) => k === 'code' || spec.fields[k] === 'code');
			const idVal = String(params.name || '').trim() || (codeKey ? String(raw[codeKey] || '') : '');
			if (!idVal) return methodError(res, 400, 'ValidationError', 'المعرف مطلوب');
			cols.unshift(spec.idCol);
			sqlParams.unshift(idVal);
		}
		// Tenant scoping on insert: the caller's tenant, or `''` (global template)
		// for a tenant-less session — the same rows pushTenantScope then reads back.
		if (tenantColumnKnown(spec.table)) {
			try {
				const tid = resolveTenantFilter(req).tenantId || '';
				cols.push('tenant_id');
				sqlParams.push(tid);
			} catch {
				return methodError(res, 403, 'PermissionError', 'نطاق المستأجر غير صالح');
			}
		}
		try {
			db.prepare(`INSERT INTO ${spec.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(
				...sqlParams,
			);
		} catch (e) {
			if (/UNIQUE|PRIMARY/i.test(String(e.message)))
				return methodError(res, 409, 'DuplicateEntry', 'السجل موجود مسبقًا');
			return methodError(res, mapErrorStatus(e), 'ValidationError', String(e.message || 'فشل الإدراج').slice(0, 200));
		}
		const idVal = sqlParams[cols.indexOf(spec.idCol)];
		const { where, count } = idLookupWhere(spec);
		const row = db.prepare(`SELECT * FROM ${spec.table} WHERE ${where} LIMIT 1`).get(...Array(count).fill(idVal));
		const saved = spec.mapRow ? spec.mapRow(row) : redactRow(spec, row);
		req.audit?.('reference.insert', { doctype: params.doctype, id: idVal });
		return res.status(201).json({ message: saved });
	});

	def('dypos.delete_doc', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
			return methodError(res, 403, 'PermissionError', 'صلاحية غير كافية');
		}
		const spec = resolveDoctype(params.doctype);
		if (!spec) return res.json({ message: { deleted: true } });
		const name = String(params.name || '').trim();
		if (!name) return methodError(res, 400, 'ValidationError', 'المعرف مطلوب');
		if (!assertMethodRecordTenant(req, res, spec, name)) return;
		const { where, count } = idLookupWhere(spec);
		try {
			// Retire, never destroy: a table without an is_active flag cannot
			// retire its rows, so the request is refused instead of deleting history.
			const cols = db
				.prepare(`PRAGMA table_info(${spec.table})`)
				.all()
				.map((c) => c.name);
			if (!cols.includes('is_active')) {
				return methodError(res, 400, 'ValidationError', 'الحذف الفيزيائي مرفوض — يتطلب عمود حالة');
			}
			db.prepare(`UPDATE ${spec.table} SET is_active=0 WHERE ${where}`).run(...Array(count).fill(name));
			return res.json({ message: { deleted: true } });
		} catch (e) {
			return methodError(res, mapErrorStatus(e), 'ValidationError', String(e.message || 'فشل الحذف').slice(0, 200));
		}
	});
}

export default registerDocWriteHandlers;
