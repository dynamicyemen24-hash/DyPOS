/**
 * Subscriber registration authority.
 * Keeps tenant/organization/branch/warehouse creation atomic.
 */
export async function registerSubscriber({
	db,
	crypto,
	hashPasswordAsync,
	methodError,
	params,
	req,
	res,
}) {
	const username = String(params.username || params.usr || params.email || "").trim()
	const password = String(params.password || params.pwd || "")
	const fullName = String(params.full_name || params.fullName || username).trim()
	const companyName = String(
		params.company || params.company_name || params.companyName || params.organization || "",
	).trim()
	const requestedTenantId = String(params.tenantId || "").trim()
	const role = String(params.role || "CASHIER").toUpperCase()

	if (!username || username.length < 3)
		return methodError(res, 400, "ValidationError", "اسم المستخدم غير صالح")
	if (password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(password))
		return methodError(res, 400, "ValidationError", "كلمة المرور 8+ أحرف (حرف ورقم)")
	if (db.prepare("SELECT 1 FROM users WHERE username=?").get(username))
		return methodError(res, 409, "ValidationError", "اسم المستخدم موجود مسبقًا")

	const isPublicOnboarding = !req.user
	let tenantId = requestedTenantId || null
	let tenantCode = null
	let finalRole = ["ADMIN", "MANAGER", "CASHIER", "AUDITOR"].includes(role) ? role : "CASHIER"

	if (isPublicOnboarding) {
		if (requestedTenantId)
			return methodError(res, 403, "PermissionError", "إنشاء اشتراك جديد لا يقبل نطاق مشترك موجود")
		if (companyName.length < 2)
			return methodError(res, 400, "ValidationError", "اسم المؤسسة مطلوب لإنشاء اشتراك جديد")
		finalRole = "ADMIN"
		tenantId = crypto.randomUUID()
		tenantCode = `DYPOS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`
	} else if (requestedTenantId) {
		const tenant = db.prepare("SELECT id FROM tenants WHERE id=? AND is_active=1").get(requestedTenantId)
		if (!tenant) return methodError(res, 404, "NotFoundError", "المشترك غير موجود أو موقوف")
		if (req.user.role !== "ADMIN")
			return methodError(res, 403, "PermissionError", "فقط المدير يمكنه إنشاء حسابات داخل المشترك")
		tenantId = requestedTenantId
	} else if (["ADMIN", "MANAGER"].includes(finalRole) && req.user.role !== "ADMIN") {
		return methodError(res, 403, "PermissionError", "التسجيل يتطلب صلاحية مدير")
	}

	const id = crypto.randomUUID()
	const hash = await hashPasswordAsync(password)
	const branchName = String(params.branchName || params.branch_name || "المركز الرئيسي").trim().slice(0, 120) || "المركز الرئيسي"
	const branchCode = String(params.branchCode || params.branch_code || "MAIN").trim().toUpperCase().slice(0, 32) || "MAIN"
	const requestedCurrency = String(params.currency || "SAR").trim().toUpperCase()
	const currency = /^[A-Z]{3}$/.test(requestedCurrency) ? requestedCurrency : "SAR"
	let organizationId = null
	let branchId = null
	let warehouseId = null

	try {
		db.transaction(() => {
			if (isPublicOnboarding) {
				db.prepare("INSERT INTO tenants (id,name,code,plan) VALUES (?,?,?,?)").run(
					tenantId, companyName, tenantCode, "standard",
				)
				organizationId = crypto.randomUUID()
				db.prepare("INSERT INTO organizations (id,tenant_id,name,code) VALUES (?,?,?,?)").run(
					organizationId, tenantId, companyName, tenantCode,
				)
				warehouseId = crypto.randomUUID()
				db.prepare("INSERT INTO warehouses (id,name,tenant_id) VALUES (?,?,?)").run(
					warehouseId, "المستودع الرئيسي", tenantId,
				)
				branchId = crypto.randomUUID()
				db.prepare("INSERT INTO branches (id,org_id,tenant_id,name,code,warehouse_id) VALUES (?,?,?,?,?,?)").run(
					branchId, organizationId, tenantId, branchName, branchCode, warehouseId,
				)
			}
			db.prepare("INSERT INTO users (id,username,password_hash,full_name,role,tenant_id) VALUES (?,?,?,?,?,?)").run(
				id, username, hash, fullName, finalRole, tenantId,
			)
			try {
				db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").run(
					`tenant.${tenantId}.currency`, currency,
				)
			} catch {
				// Legacy settings schemas may omit this table/key shape.
			}
		})()
	} catch (e) {
		if (/UNIQUE/i.test(String(e.message)))
			return methodError(res, 409, "ValidationError", "بيانات الاشتراك مستخدمة مسبقًا")
		throw e
	}

	req.audit?.("auth.register", {
		newUser: username, role: finalRole, tenantId,
		publicOnboarding: isPublicOnboarding, organizationId, branchId, warehouseId,
	})
	return res.status(201).json({
		message: {
			id, username, fullName, role: finalRole, tenantId,
			subscriberCode: tenantCode, organizationId, branchId, warehouseId,
			branchName, currency,
		},
	})
}
