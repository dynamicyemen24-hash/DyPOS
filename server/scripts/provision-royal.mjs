/**
 * تهيئة هوية رويال العالمية للإنتاج — حسابات الدخول فقط، بلا بيانات عينة.
 * =====================================================================
 * لماذا هذا الملف موجود (ولماذا الحارس باقٍ):
 *
 * - `seed-royal-production.mjs` بذرة **عينة تطويرية** (64 صنفًا + أرصدة
 *   افتتاحية + عملاء وهميين) وحارسها `seed-safety.mjs` يرفض الإنتاج عمدًا
 *   (`NODE_ENV=production` + أي مستأجر أجنبي). حذفه كان سيفتح باب الكتابة
 *   فوق بيانات مشترك حقيقي — وهو ما أسقطته البوابة الأمنية من قبل
 *   (كلمة `Royal@2024!` الصلبة + مخزون مختلق: S1+S4).
 * - العميل المتعطل لا يحتاج العينة — يحتاج **هوية الدخول**: المستأجر RGT
 *   + الفروع + المستخدمين السبعة، وكلمة مرور يعرفها المشغّل وحده.
 *
 * ما يفعله هذا السكربت (هوية فقط):
 * - ينشئ المستأجر `RGT` + المؤسسة + الفروع الثلاثة + المستودعات إن غابت
 *   (UPSERT بالمفاتيح الثابتة — لا حذف أبدًا).
 * - ينشئ المستخدمين السبعة **إن غابوا فقط**. الموجود تُحدَّث بياناته
 *   الوصفية ويُحافَظ على `password_hash` القديم — إعادة التشغيل لا تُدوِّر
 *   كلمة سلّمت لصاحبها.
 * - لا يلمس إطلاقًا: الأصناف، المخزون، الفواتير، العملاء، الأرصدة
 *   الافتتاحية، مفاتيح API. من يريد الكتالوج يستورد ملف العميل الحقيقي.
 *
 * الأمان (صريح ومزدوج في الإنتاج):
 * - كلمات المرور **ليست في المستودع**: من `DYPOS_PROVISION_PW_<USER>`
 *   (12+ حرفًا) أو مولّدة عشوائيًا (`randomBytes` + `Aa1!`) وتُطبع **مرة
 *   واحدة** — ثم تعيش `bcrypt cost 12` فقط.
 * - كل حساب جديد `must_change_password=1` — أول دخول يفرض التغيير.
 * - في `NODE_ENV=production` يشترط **معًا**: `--confirm-production` في
 *   سطر الأوامر + `DYPOS_ALLOW_PROD_PROVISION=1` في البيئة، ويأخذ نسخة
 *   `VACUUM INTO` قبل أي كتابة. بدونهما يرفض ويفشل بصوت عالٍ.
 *
 * التشغيل:
 *   npm run migrate
 *   DYPOS_PROVISION_PW_ADMIN='...' DYPOS_PROVISION_PW_YAQOUB_SAHEL='...' \
 *     npm run provision:royal -- --confirm-production   (إنتاج فقط)
 *   npm run provision:royal                             (تطوير/اختبار)
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DYPOS_DB_PATH || join(HERE, '..', 'data', 'dypos.db');
const NODE_ENV = process.env.NODE_ENV || 'development';
const CONFIRMED = process.argv.includes('--confirm-production');
const ALLOWED = process.env.DYPOS_ALLOW_PROD_PROVISION === '1';
const IS_PROD = NODE_ENV === 'production';

if (IS_PROD && !(CONFIRMED && ALLOWED)) {
	console.error(
		'Refusing production provision: pass --confirm-production AND set DYPOS_ALLOW_PROD_PROVISION=1. ' +
			'خذ نسخة احتياطية أولًا: npm run backup. ' +
			'هذا القفل مقصود — تهيئة الإنتاج قرار مشغّل، لا أمر يُنفَّذ بالخطأ.',
	);
	process.exit(2);
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ORG_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_SANAA = '44444444-4444-4444-4444-444444444444';
const BRANCH_ADEN = '33333333-3333-3333-3333-333333333333';
const BRANCH_MARIB = '22222222-2222-2222-2222-222222222222';
const BUSINESS_NAME = 'رويال العالمية لتجارة أدوات التجميل والعطور';

// username → [fullName, role]
const USERS = [
	['admin', 'مدير النظام العام', 'ADMIN'],
	['yaqoub.sahel', 'يعقوب سهل — مدير المشترك', 'MANAGER'],
	['sanaa.manager', 'مدير فرع صنعاء', 'MANAGER'],
	['sanaa.cashier', 'كاشير صنعاء الأول', 'CASHIER'],
	['sanaa.cashier2', 'كاشير صنعاء الثاني', 'CASHIER'],
	['aden.cashier', 'كاشير عدن', 'CASHIER'],
	['marib.cashier', 'كاشير مأرب', 'CASHIER'],
];

function passwordFor(username) {
	const envKey = `DYPOS_PROVISION_PW_${username.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
	const supplied = String(process.env[envKey] || '');
	if (supplied.length >= 12) return supplied;
	return `${randomBytes(15).toString('base64url')}Aa1!`;
}

function upsert(db, table, key, row) {
	const keys = Array.isArray(key) ? key : [key];
	const cols = Object.keys(row);
	const placeholders = cols.map(() => '?').join(',');
	const updates = cols
		.filter((c) => !keys.includes(c))
		.map((c) => `${c}=excluded.${c}`)
		.join(',');
	db.prepare(
		`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(${keys.join(',')}) DO UPDATE SET ${updates}`,
	).run(...cols.map((c) => row[c]));
}

const now = () => new Date().toISOString();
const db = new DatabaseSync(DB_PATH);
const issued = [];

try {
	// نسخة احتياطية قبل الكتابة في الإنتاج — التوفر أولًا، والحماية ثانيًا.
	if (IS_PROD && DB_PATH !== ':memory:') {
		const backupDir = process.env.DYPOS_BACKUP_DIR || join(HERE, '..', 'data', 'backups');
		mkdirSync(backupDir, { recursive: true });
		const snap = join(backupDir, `pre-provision-${Date.now()}.db`);
		db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
		console.log(`نسخة ما قبل التهيئة: ${snap}`);
	}

	db.exec('BEGIN');
	try {
		upsert(db, 'tenants', 'id', {
			id: TENANT_ID,
			name: BUSINESS_NAME,
			code: 'RGT',
			plan: 'enterprise',
			is_active: 1,
			created_at: now(),
			updated_at: now(),
		});
		upsert(db, 'organizations', 'id', {
			id: ORG_ID,
			tenant_id: TENANT_ID,
			name: BUSINESS_NAME,
			code: 'RGT',
			vat_number: '1000000000',
			is_active: 1,
			created_at: now(),
			updated_at: now(),
		});
		const BR = {
			[BRANCH_SANAA]: ['فرع صنعاء الرئيسي', 'BR-SANAA', 'W-03', 'مستودع صنعاء المركزي', 'صنعاء - شارع حدة'],
			[BRANCH_ADEN]: ['فرع عدن', 'BR-ADEN', 'W-02', 'مستودع عدن', 'عدن - المنصورة'],
			[BRANCH_MARIB]: ['فرع مأرب', 'BR-MARIB', 'W-01', 'مستودع مأرب', 'مأرب - المجمع'],
		};
		for (const [id, [name, code, wh, whName, addr]] of Object.entries(BR)) {
			upsert(db, 'branches', 'id', {
				id,
				org_id: ORG_ID,
				tenant_id: TENANT_ID,
				name,
				code,
				warehouse_id: wh,
				is_active: 1,
				created_at: now(),
				updated_at: now(),
			});
			upsert(db, 'warehouses', 'id', {
				id: wh,
				name: whName,
				tenant_id: TENANT_ID,
				branch_id: id,
				is_active: 1,
				address: addr,
			});
		}

		for (const [username, fullName, role] of USERS) {
			const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
			if (existing) {
				db.prepare(
					'UPDATE users SET full_name=?, role=?, tenant_id=?, is_active=1, must_change_password=1 WHERE username=?',
				).run(fullName, role, TENANT_ID, username);
				continue;
			}
			const password = passwordFor(username);
			issued.push([username, password, fullName, role]);
			db.prepare(
				'INSERT INTO users (id,username,password_hash,full_name,role,tenant_id,is_active,must_change_password,created_at) VALUES (?,?,?,?,?,?,1,1,?)',
			).run(randomUUID(), username, bcrypt.hashSync(password, 12), fullName, role, TENANT_ID, now());
		}

		db.exec('COMMIT');
	} catch (e) {
		try {
			db.exec('ROLLBACK');
		} catch {
			/* already rolled back */
		}
		throw e;
	}

	console.log('تمت تهيئة هوية رويال (مستأجر + فروع + مستخدمون) — بلا بيانات عينة.');
	console.log('الدخول الآن: https://dypos.smartportssoft.com/pos/account/login');
	console.log('  رمز المشترك: RGT (أو اتركه فارغًا) — ثم اختر الفرع.');
	console.log(
		'  الأسماء: admin / yaqoub.sahel / sanaa.manager / sanaa.cashier / sanaa.cashier2 / aden.cashier / marib.cashier',
	);
	if (issued.length === 0) {
		console.log(
			'(لا كلمات جديدة — كل الحسابات موجودة، وحُوفظ على كلماتها. استخدم نسيت كلمة المرور أو أعد التعيين من السيرفر.)',
		);
	} else {
		console.log('\nكلمات المرور الصادرة في هذا التشغيل (تُعرض مرة واحدة — احفظها الآن وغيّرها عند أول دخول):');
		for (const [u, p, name, role] of issued) console.log(`  ${role.padEnd(7)} ${u.padEnd(15)} ${p}  (${name})`);
	}
} finally {
	try {
		db.close();
	} catch {
		/* ignore */
	}
}
