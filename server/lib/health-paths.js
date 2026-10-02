/**
 * مسارات الفحص الصحي — مصدر واحد.
 *
 * كل مسار يُستثنى من حدّ المعدّل ومن سجلّ الطلبات: مجسّس फحوصص الذي
 * يُخفَض يبدو انقطاعًا. القائمة كانت مُعرَّفة داخل `server.js` بينما
 * يحتاجها `middleware/rate-limiters.js` أيضًا — تعريفان لنفس المجموعة
 * هو بالضبط كيف يختفي `/api/ready` من الاستثناء بعد نصف سنة.
 *
 *   /health     — الاسمAlias الذي تضربه كل مراقبات الجاهزية وحاويات
 *                 Docker ومنصّة الاستضافة؛ الـ Cloudflare Worker يجيب
 *                 على الاسم نفسه فيتحرّكان متطابقين.
 */
export const HEALTH_PATHS = new Set(['/health', '/api/health', '/api/ready']);

export default HEALTH_PATHS;
