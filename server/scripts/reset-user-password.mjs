/**
 * تعيين كلمة مرور مستخدم — المشغّل فقط، والسرّ من البيئة فقط.
 * ============================================================
 * كلمة المرور لا تُقبل من سطر الأوامر (تبقى في سجلّ الصدفة) ولا من
 * ملف (تبقى في Git) — فقط من `DYPOS_RESET_PW`. القيمة لا تُطبع
 * أبدًا: ما يصل قاعدة البيانات هو `bcrypt cost 12` فقط.
 *
 * ما يفعله (صف واحد فقط، المسمّى صراحة):
 * - يتحقق من سياسة كلمة المرور نفسها التي يفرضها `/change-password`
 *   (8+ أحرف، حرف ورقم) — كلمة ضعيفة مرفوضة بصوت عالٍ.
 * - `UPDATE users SET password_hash` للمستخدم المسمّى فقط، مع
 *   `is_active=1` (تفعيل صريح بقرار المشغّل) و `must_change_password=0`
 *   (السرّ مختار من مالكه، لا مولّد من مشغّل — التدوير القسري هنا
 *   كذبة: المالك سيعيد نفس الكلمة).
 * - يُبطل كل جلسات المستخدم (`user_sessions`) — الرموز المسروقة تموت.
 *
 * الأمان:
 * - المستخدم المجهول مرفوض (لا إنشاء ضمني — الإنشاء له
 *   `provision:royal` و `create-local-user` بمساريهما المدققين).
 * - يتطلب `--confirm` دائمًا — لا تعيين بالخطأ.
 * - في `NODE_ENV=production` يتطلب أيضًا `DYPOS_ALLOW_PROD_PROVISION=1`
 *   ويأخذ نسخة `VACUUM INTO` قبل الكتابة (قرار إنتاج = قرار مزدوج).
 *
 * التشغيل (على مضيف السيرفر نفسه، حيث ملف القاعدة):
 *   DYPOS_RESET_PW='...' node scripts/reset-user-password.mjs --username yaqoub.sahel --confirm
 *   DYPOS_RESET_PW='...' DYPOS_ALLOW_PROD_PROVISION=1 \
 *     node scripts/reset-user-password.mjs --username yaqoub.sahel --confirm   (إنتاج)
 */
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DYPOS_DB_PATH || join(HERE, '..', 'data', 'dypos.db');
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const argv = process.argv.slice(2);
const arg = (flag) => {
	const i = argv.indexOf(flag);
	return i === -1 ? null : argv[i + 1];
};
const username = String(arg('--username') || '').trim();
const confirmed = argv.includes('--confirm');
const allowed = process.env.DYPOS_ALLOW_PROD_PROVISION === '1';
const secret = String(process.env.DYPOS_RESET_PW || '');

function fail(message) {
	console.error(`Refusing password reset: ${message}`);
	process.exit(2);
}

if (!username) fail('pass --username <name>. No implicit user, no bulk reset.');
if (!confirmed) fail('pass --confirm. A password change is always explicit.');
if (secret.length < 8 || !/(?=.*[A-Za-z])(?=.*\d).+/.test(secret)) {
	fail('password policy: 8+ characters with a letter and a digit (read from DYPOS_RESET_PW only).');
}
if (IS_PROD && !allowed) {
	fail('production needs DYPOS_ALLOW_PROD_PROVISION=1 AND --confirm. Take a backup first: npm run backup.');
}

const db = new DatabaseSync(DB_PATH);
try {
	const user = db.prepare('SELECT id, username, is_active FROM users WHERE username=?').get(username);
	if (!user) fail(`unknown user '${username}'. This tool never creates accounts.`);

	if (IS_PROD && DB_PATH !== ':memory:') {
		const backupDir = process.env.DYPOS_BACKUP_DIR || join(HERE, '..', 'data', 'backups');
		mkdirSync(backupDir, { recursive: true });
		const snap = join(backupDir, `pre-pwreset-${Date.now()}.db`);
		db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
		console.log(`نسخة ما قبل التعيين: ${snap}`);
	}

	const hash = bcrypt.hashSync(secret, 12);
	db.prepare('UPDATE users SET password_hash=?, is_active=1, must_change_password=0 WHERE id=?').run(hash, user.id);
	let revoked = 0;
	try {
		revoked = Number(db.prepare('UPDATE user_sessions SET revoked=1 WHERE user_id=?').run(user.id).changes || 0);
	} catch {
		/* fresh DB without sessions table — nothing to revoke */
	}
	console.log(`تم تعيين كلمة مرور جديدة للمستخدم '${username}' (is_active=1، الجلسات المبطة: ${revoked}).`);
	console.log('الدخول: البريد/الاسم + الكلمة الجديدة. بدّلها من الإعدادات بعد أول دخول إن تسربت.');
} finally {
	try {
		db.close();
	} catch {
		/* ignore */
	}
}
