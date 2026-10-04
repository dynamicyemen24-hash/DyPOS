/**
 * إنشاء حساب مستخدم حقيقي في قاعدة الخادم المحلية.
 *
 * يستخدم نفس مسار الخادم (bcrypt cost 12) بدل حقن SQL يدوي.
 *
 *   node scripts/create-local-user.mjs --name "يعقوب" --username yaqoub [--password ...]
 *
 * ثلاث قواعد، كل واحدة درس من باب مفتوح:
 *
 *  1. **لا كلمة مرور افتراضية.** كلمة مرور مكتوبة في نص المستودع هي كلمة مرور
 *     معروفة لكل من قرأ السطر، ولكل نسخة احتياطية منه. الافتراضي هنا
 *     **مولَّد عشوائيًا**، أو يمرَّر عبر `DYPOS_LOCAL_USER_PASSWORD` من متغير
 *     البيئة (الطريقة الصحيحة في نشر حقيقي). لا يوجد مسار يجعل كلمة المرور
 *     معروفة سلفًا.
 *
 *  2. **`must_change_password=1` دائمًا.** الحساب الذي يولّده مشغّل المتجر
 *     يجب أن يغيّر كلمة مروره عند أول دخول. أن يبقى الحساب على كلمة واحدة
 *     يعني أن أول من قرأ هذا الملف هو من يدخل المتجر.
 *
 *  3. **`--print-password` اختياري صريح.** الطباعة عند الطلب فقط، لأن مخرجات
 *     الطرفية تسري في سجلّات CI وخدمات النشر.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomInt } from 'node:crypto';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '..');

const argv = process.argv.slice(2);
const arg = (flag, fallback) => {
	const i = argv.indexOf(flag);
	return i === -1 ? fallback : argv[i + 1];
};

const fullName = (arg('--name') || '').trim();
const username = (arg('--username') || fullName).trim();
const role = (arg('--role') || 'CASHIER').toUpperCase();
const dbPath = arg('--db', resolve(SERVER, 'data', 'dypos.db'));
const printPassword = argv.includes('--print-password');

const fullNameRequired = fullName.length > 0;
const usernameRequired = username.length > 0;
if (!fullNameRequired || !usernameRequired) {
	console.error('usage: node scripts/create-local-user.mjs --name "الاسم" --username user');
	process.exit(2);
}
if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(role)) {
	console.error(`role must be ADMIN | MANAGER | CASHIER (got ${role})`);
	process.exit(2);
}

/**
 * كلمة مرور قوية: 20 محرفًا من أربع مجموعات أحرف، مع ضمان
 * فئة واحدة على الأقل من كل مجموعة. الأحرف الملتصقة (I/l/1/O/0) مستبعدة
 * عمدًا: كلمة يقرؤها الكاشير مرة واحدة يجب أن تُنقل بلا خطأ.
 */
function generatePassword() {
	const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	const LOWER = 'abcdefghijkmnopqrstuvwxyz';
	const DIGITS = '23456789';
	const SYMBOLS = '!@#$%*-_=+';
	const all = UPPER + LOWER + DIGITS + SYMBOLS;
	const pick = (set) => set[randomInt(set.length)];
	const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
	for (let i = chars.length; i < 20; i++) chars.push(pick(all));
	// خلط Fisher-Yates بعشوائية تشفيرية: ترتيب الإخراج لا يفضح التركيب.
	for (let i = chars.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[chars[i], chars[j]] = [chars[j], chars[i]];
	}
	return chars.join('');
}

// لا شيء في هذا الملف يذكر كلمة مرور.
const generated = !process.env.DYPOS_LOCAL_USER_PASSWORD && !arg('--password');
const password = process.env.DYPOS_LOCAL_USER_PASSWORD || arg('--password') || generatePassword();

const db = new Database(dbPath);
const exists = db.prepare('SELECT id, role, is_active FROM users WHERE username = ?').get(username);

if (exists) {
	// الحساب موجود: نُعيد التفعيل ونضبط الدور. **لا** نلمس كلمة المرور ولا
	// `must_change_password`: إعادة تعيين كلمة مرور مستخدم قائم قرار يخص
	// مالكه، وله مسار تغيير كلمة المرور في واجهة المستخدم.
	db.prepare('UPDATE users SET full_name=?, role=?, is_active=1 WHERE username=?').run(fullName, role, username);
	console.log(`updated existing user: ${username} (${fullName}) role=${role}`);
	console.log('password unchanged — use the change-password flow to reset it');
} else {
	const hash = bcrypt.hashSync(password, 12);
	db.prepare(
		'INSERT INTO users (id, username, password_hash, full_name, role, is_active, must_change_password) VALUES (?,?,?,?,?,1,1)',
	).run(randomUUID(), username, hash, fullName, role);
	console.log(`created user: ${username} (${fullName}) role=${role}`);
}
console.log(`database: ${dbPath}`);
if (generated && !printPassword) {
	console.log('password generated and NOT printed — re-run with --print-password, or pass DYPOS_LOCAL_USER_PASSWORD');
} else if (printPassword) {
	console.log(`password: ${password}`);
}
db.close();
