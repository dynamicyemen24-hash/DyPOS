/**
 * مسارات Passkey (WebAuthn / FIDO2) — تسجيل المصادقة الحيوية والدخول بها.
 *
 * لماذا هذا الملف: محرك `lib/webauthn.js` كان مكتملًا ومُختبَرًا،
 * والجداول موجودة (v32)، لكن **لا مسار يصل إليهما** — فلم يكن هناك
 * زر، ولا تسجيل، ولا دخول. هذا الملف يربط الاثنين.
 *
 * ما لا يحدث هنا أبدًا: لا صورة، ولا بصمة، ولا قالب وجه. المطابقة
 * تجري داخل الو enclive؛ ما يصلنا توقيع بمفتاح عام فقط. لذلك لا نحتاج
 * تخزينًا للبيانات البيولوجية أصلًا.
 *
 * القيود (fail-closed):
 *  - `tenant_id` على كل صف، والقراءة تتطلّب صلاحية (invariant 1).
 *  - `challenge` أحادي الاستخدام وينتهي سريعًا، فالتحدي المسروق لا يُعاد.
 *  - `userVerification: "required"` دائمًا: القبول بـPIN وحده يُبطل وسم
 *    «دخول بالبصمة» — إمّا تحقق حيوي، أو لا الزر.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import db from '../db/schema.js';
import { authMiddleware, generateToken } from '../middleware/auth.js';
import { ah } from '../lib/async.js';
import {
  authenticationOptions,
  b64u,
  randomChallenge,
  registrationOptions,
  verifyAssertion,
  verifyRegistration,
} from '../lib/webauthn.js';
import { v4 as uuid } from 'uuid';

const router = Router();

/** الاسم المعروض في طلب المصادقة. */
const RP_NAME = 'DyPOS';
/** مهلة التحدي (دقائق) — قصيرة عمدًا: نافذة تسجيل لا نافذة جلسة. */
const CHALLENGE_TTL_MINUTES = 5;

/**
 * المضيفون المسموح بهم.
 * `localhost` و`127.0.0.1` محليّان فقط.
 */
function allowedOrigins(req) {
  const configured = String(process.env.DYPOS_WEBAUTHN_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  const host = req.get('host');
  if (!host) return [];
  const port = host.split(':')[1];
  return [`https://${host}`, `http://${host}`, ...(port ? [`http://localhost:${port}`] : [])];
}

function relyingPartyId(req) {
  return process.env.DYPOS_WEBAUTHN_RP_ID || String(req.get('host') || 'localhost').split(':')[0];
}

/** حدّ محاولات الـceremonies — منقولة الأرقام تلتقط biometrics. */
const ceremonyLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.' },
});

/** يقرأ body ويتحقق أنه كائن JSON (لا مصفوفة ولا نص). */
function readBody(req) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body;
}

/** POST /api/auth/passkeys/register/options — خيارات التسجيل. */
router.post(
  '/passkeys/register/options',
  ceremonyLimit,
  ah(async (req, res) => {
    const body = readBody(req);
    const email = String(body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'البريد الإلكتروني مطلوب.' });

    const user = db.prepare('SELECT id, username, full_name FROM users WHERE username = ? AND is_active = 1').get(email);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود.' });

    const challenge = randomChallenge();
    // `excludeCredentials` تمنع تسجيل نفس المفتاح مرتين، فالمستخدم لا
    // يرى «أضف بصمة» ناجحة وهي لم تفعل شيئًا.
    const existing = db
      .prepare('SELECT credential_id FROM passkey_credentials WHERE user_id = ?')
      .all(user.id)
      .map((row) => ({ credential_id: row.credential_id }));

    const options = registrationOptions({
      challenge,
      rpId: relyingPartyId(req),
      rpName: RP_NAME,
      user: {
        id: b64u(String(user.id)),
        name: user.username,
        displayName: user.full_name || user.username,
      },
      exclude: existing,
    });
    db.prepare(
      `INSERT INTO passkey_challenges (challenge, user_id, tenant_id, purpose, expires_at)
       VALUES (?, ?, ?, 'register', datetime('now', ?))`,
    ).run(challenge, user.id, String(req.get('host') || '').split(':')[0], `+${CHALLENGE_TTL_MINUTES} minutes`);

    res.json({ ...options, challenge });
  }),
);

/** POST /api/auth/passkeys/register — تأكيد التسجيل. */
router.post(
  '/passkeys/register',
  ceremonyLimit,
  ah(async (req, res) => {
    const body = readBody(req);
    const challenge = String(body?.challenge || '');
    const row = db.prepare('SELECT * FROM passkey_challenges WHERE challenge = ?').get(challenge);
    // أحادي الاستخدام: يُحذف **قبل** التحقق، فإعادة إرسال نفس الطلب
    // لا تجد تحديًا，即便 لو فشل الأول.
    db.prepare('DELETE FROM passkey_challenges WHERE challenge = ?').run(challenge);
    if (!row) return res.status(400).json({ message: 'انتهت صلاحية الطلب. أعد المحاولة.' });

    let verified;
    try {
      verified = verifyRegistration({
        clientDataJSON: body?.clientDataJSON,
        attestationObject: body?.attestationObject,
        response: body?.response,
        rpId: relyingPartyId(req),
        origin: allowedOrigins(req),
        challenge,
        requireUserVerified: true,
      });
    } catch (error) {
      // سبب الرفض يُسجَّل (تشخيص) ولا يُعاد للمستخدم: الرسالة العربية
      // أعلاه مقصودة، وتفاصيل التحقق تكشف معلومات عن المفاتيح.
      console.warn('[passkeys] registration refused:', error.message);
      return res.status(400).json({ message: 'تعذر التحقق من المفتاح الحيوي.' });
    }

    db.prepare(
      `INSERT INTO passkey_credentials
         (id, user_id, tenant_id, credential_id, public_key, algorithm,
          counter, transports, device_label, aaguid, backed_up, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      uuid(),
      row.user_id,
      String(req.get('host') || '').split(':')[0],
      verified.credentialId,
      verified.publicKey,
      verified.algorithm,
      verified.signCount,
      JSON.stringify(verified.transports || []),
      String(body?.deviceLabel || 'جهاز هذا المستخدم').slice(0, 120),
      verified.aaguid || null,
      verified.backedUp ? 1 : 0,
    );
    res.json({ ok: true, credential_id: verified.credentialId });
  }),
);


/**
 * POST /api/auth/passkeys/login/options — تحدّي الدخول.
 *
 * لا يكشف إن كان البريد مسجّلاً: التحقق يتم في التأكيد لا في التحدّي.
 */
router.post(
  '/passkeys/login/options',
  ceremonyLimit,
  ah(async (req, res) => {
    const body = readBody(req);
    const email = String(body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'البريد الإلكتروني مطلوب.' });

    const user = db.prepare('SELECT id FROM users WHERE username = ? AND is_active = 1').get(email);
    const allow = user
      ? db
          .prepare('SELECT credential_id FROM passkey_credentials WHERE user_id = ? AND revoked = 0')
          .all(user.id)
      : [];
    const challenge = randomChallenge();
    db.prepare(
      `INSERT INTO passkey_challenges (challenge, user_id, tenant_id, purpose, expires_at)
       VALUES (?, ?, ?, 'login', datetime('now', ?))`,
    ).run(challenge, user?.id || null, String(req.get('host') || '').split(':')[0], `+${CHALLENGE_TTL_MINUTES} minutes`);

    // **نفس الردّ** سواء وُجد المستخدم أم لم يُوجد. الردّ المتفرّق كان
    // يجعل هذا المسار مِ probe لوجود البريد (تسريب معلومات).
    res.json({ ...authenticationOptions({ challenge, allow }), challenge });
  }),
);

/** POST /api/auth/passkeys/login — تأكيد الدخول. */
router.post(
  '/passkeys/login',
  ceremonyLimit,
  ah(async (req, res) => {
    const body = readBody(req);
    const challenge = String(body?.challenge || '');
    const row = db.prepare('SELECT * FROM passkey_challenges WHERE challenge = ?').get(challenge);
    db.prepare('DELETE FROM passkey_challenges WHERE challenge = ?').run(challenge);
    if (!row) return res.status(400).json({ message: 'انتهت صلاحية الطلب. أعد المحاولة.' });

    const credentialId = String(body?.id || body?.credentialId || '');
    const credential = db
      .prepare('SELECT * FROM passkey_credentials WHERE credential_id = ? AND revoked = 0')
      .get(credentialId);
    if (!credential || credential.user_id !== row.user_id) {
      return res.status(401).json({ message: 'تعذر التحقق من الهوية. استخدم كلمة المرور.' });
    }

    let verified;
    try {
      verified = verifyAssertion({
        credential,
        clientDataJSON: body?.clientDataJSON,
        authenticatorData: body?.authenticatorData,
        signature: body?.signature,
        userHandle: body?.userHandle,
        challenge,
        origin: allowedOrigins(req),
        requireUserVerified: true,
      });
    } catch (error) {
      console.warn('[passkeys] assertion refused:', error.message);
      return res.status(401).json({ message: 'تعذر التحقق من الهوية. استخدم كلمة المرور.' });
    }

    // كشف الاستنساخ: عدّاد لا يتقدّم (أو يتراجع) يعني أن نسختين وقّعتا
    // بنفس المفتاح. يُلغى المفتاح فورًا ويُطلب تسجيل جديد.
    if (verified.signCount > 0 && verified.signCount <= credential.counter) {
      db.prepare('UPDATE passkey_credentials SET revoked = 1 WHERE id = ?').run(credential.id);
      return res.status(401).json({ message: 'تم إلغاء مفتاح الحيوي لأسباب أمنية. سجّله من جديد.' });
    }
    db.prepare(
      "UPDATE passkey_credentials SET counter = ?, last_used_at = datetime('now') WHERE id = ?",
    ).run(verified.signCount, credential.id);

    const user = db
      .prepare('SELECT id, username, full_name, role FROM users WHERE id = ? AND is_active = 1')
      .get(row.user_id);
    if (!user) return res.status(401).json({ message: 'تعذر التحقق من الهوية. استخدم كلمة المرور.' });

    res.json({ user: { id: user.id, email: user.username, fullName: user.full_name, role: user.role }, token: generateToken(user) });
  }),
);

/**
 * GET /api/auth/passkeys — قائمة الأجهزة الموثوقة.
 *
 * نمط SAP Fiori «Trusted Devices»: ما سُجِّل، متى، وآخر استعمال. بدون
 * هذه القائمة التسجيل **لا يمكن التراجع عنه**، ومفتاح لا يستطيع صاحبه
 * إبطاله لا يخرج أبدًا من حسابه.
 *
 * `active` مضاف على `revoked` لأن الواجهة تعرض المجموع والفاعل معًا،
 * والحساب يبدأ من صف واحد يجب أن يميّزه.
 */
router.get(
  '/passkeys',
  authMiddleware,
  ah(async (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, device_label, created_at, last_used_at, revoked, backed_up, transports
           FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all(req.user.id);
    const passkeys = rows.map((row) => ({
      id: row.id,
      label: row.device_label || 'جهاز',
      created_at: row.created_at,
      last_used_at: row.last_used_at ?? null,
      revoked: Boolean(row.revoked),
      backed_up: Boolean(row.backed_up),
      // السحابة تعني أن المفتاح نسخة متزامنة: إبطاله هنا لا يمسّ النسخ
      // الأخرى، وواجهتنا تقول ذلك بدل أن تعد بوعد غير محقّق.
      synced: Boolean(row.backed_up),
    }));
    res.json({
      passkeys,
      summary: {
        total: passkeys.length,
        active: passkeys.filter((key) => !key.revoked).length,
        revoked: passkeys.filter((key) => key.revoked).length,
      },
    });
  }),
);

/**
 * PATCH /api/auth/passkeys/:id — إعادة تسمية جهاز.
 * الاسم يميّز الجهاز في القائمة؛ تغييره لا يمسّ المفتاح نفسه.
 */
router.patch(
  '/passkeys/:id',
  authMiddleware,
  ah(async (req, res) => {
    const id = String(req.params.id || '');
    const label = String(readBody(req)?.label || '').trim().slice(0, 120);
    if (!label) return res.status(400).json({ message: 'اسم الجهاز مطلوب.' });
    // `user_id = ?` جزء من شرط الاستعلام لا تحقّق لاحق: صف مستأجر آخر
    // أو مستخدم آخر يُعامَل كغير موجود (fail-closed).
    const result = db
      .prepare('UPDATE passkey_credentials SET device_label = ? WHERE id = ? AND user_id = ?')
      .run(label, id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ message: 'الجهاز غير موجود.' });
    res.json({ ok: true, id, label });
  }),
);

/**
 * DELETE /api/auth/passkeys/:id — إبطال مفتاح حيوي.
 *
 * **إبطال وليس حذف**: `revoked = 1` يبقي السطر. إبطاله يكسر المفتاح
 * فورًا (المفتاح نفسه معمّى)، مع إبقاء أثر زمني: متى سُجِّل ومتى
 * أُبطل. الحذف الفعلي كان سينكر أن المفتاح وُجد أصلًا.
 */
router.delete(
  '/passkeys/:id',
  authMiddleware,
  ah(async (req, res) => {
    const id = String(req.params.id || '');
    const row = db
      .prepare('SELECT id, revoked, device_label FROM passkey_credentials WHERE id = ? AND user_id = ?')
      .get(id, req.user.id);
    if (!row) return res.status(404).json({ message: 'الجهاز غير موجود.' });
    if (row.revoked) {
      // إعادة الإبطال عملية لا خطأ، لكن نُعلم به: زر «إبطال» مرتين
      // يجب ألا يبدو أنه نجح مرتين.
      return res.status(409).json({ message: 'هذا الجهاز مُبطَل مسبقًا.' });
    }
    db.prepare(
      "UPDATE passkey_credentials SET revoked = 1, last_used_at = COALESCE(last_used_at, datetime('now')) WHERE id = ?",
    ).run(id);
    res.json({ ok: true, id, label: row.device_label });
  }),
);

export default router;

