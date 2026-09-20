// ═══════════════════════════════════════════════════════════════════════
// Smart Ports Voice POS v1.16.0
// Web Speech API عربي (ar-SA, ar-YE) — "بيع 2 كراتين ماء" → إضافة للسلة
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ═══ Configuration ═══
  const LANGUAGES = ['ar-SA', 'ar-YE'];
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ═══ Arabic Number Map ═══
  const ARABIC_NUMBERS = Object.freeze({
    'صفر': 0, 'واحد': 1, 'واحدة': 1, 'واحده': 1,
    'إثنين': 2, 'اثنين': 2, 'اثنان': 2, 'اثنتين': 2,
    'ثلاثة': 3, 'ثلاث': 3, 'ثلاثه': 3, 'أربعة': 4, 'اربعة': 4, 'أربع': 4, 'اربع': 4,
    'خمسة': 5, 'خمسه': 5, 'خمس': 5, 'ستة': 6, 'سته': 6, 'ست': 6,
    'سبعة': 7, 'سبعه': 7, 'سبع': 7, 'ثمانية': 8, 'ثمانيه': 8, 'ثمان': 8, 'ثماني': 8,
    'تسعة': 9, 'تسعه': 9, 'تسع': 9, 'عشرة': 10, 'عشره': 10, 'عشر': 10,
    'عشرين': 20, 'ثلاثين': 30, 'اربعين': 40, 'خمسين': 50, 'مئة': 100, 'مائة': 100, 'ميه': 100,
    'نصف': 0.5, 'نص': 0.5,
  });

  // ═══ Unit Normalization Map ═══
  const UNIT_MAP = Object.freeze({
    'كرتون': 'كرتون', 'كرتونة': 'كرتون', 'كراتين': 'كرتون', 'كراتون': 'كرتون', 'كرتونه': 'كرتون',
    'حبة': 'حبة', 'حبه': 'حبة', 'حبات': 'حبة', 'حباة': 'حبة', 'قطعة': 'حبة', 'قطع': 'حبة',
    'كيس': 'كيس', 'أكياس': 'كيس', 'اكياس': 'كيس', 'كيسة': 'كيس',
    'علبة': 'علبة', 'علب': 'علبة', 'علبه': 'علبة',
    'صندوق': 'صندوق', 'صناديق': 'صندوق', 'سلة': 'سلة', 'سلال': 'سلة',
    'لتر': 'لتر', 'لترات': 'لتر', 'كيلو': 'كيلو', 'كيلوجرام': 'كيلو', 'جرام': 'جرام', 'غرام': 'جرام',
    'دستة': 'دستة', 'درزن': 'دستة', 'ربطة': 'ربطة', 'ربطات': 'ربطة',
  });

  // ═══ Verb Prefixes ═══
  const VERB_PREFIXES = Object.freeze(['بيع', 'أبيع', 'ابيع', 'بِع', 'اضف', 'أضف', 'ضيف', 'حط', 'اشتر', 'اشتري', 'أريد', 'اريد', 'عطني', 'اعطني', 'سجل', 'احسب']);

  // ═══ Helpers ═══
  function normalizeArabicDigits(text) {
    const digitMap = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
    return text.replace(/[٠-٩]/g, d => digitMap[d]);
  }

  function parseArabicQuantity(token) {
    const t = token.trim();
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    const lower = t.replace(/ة/g, 'ة').toLowerCase();
    if (ARABIC_NUMBERS[lower] !== undefined) return ARABIC_NUMBERS[lower];
    for (const k of Object.keys(ARABIC_NUMBERS)) if (lower.includes(k)) return ARABIC_NUMBERS[k];
    return null;
  }

  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // ═══ Main Parser ═══
  function parseVoiceCommand(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    let text = normalizeArabicDigits(String(rawText)).trim();
    text = text.replace(/[،,.\-—]/g, ' ').replace(/\s+/g, ' ').trim();
    let tokens = text.split(' ').filter(Boolean);

    // Remove verb prefixes
    while (tokens.length && VERB_PREFIXES.includes(tokens[0].replace(/[أإآ]/g, 'ا'))) tokens.shift();
    if (tokens[0] === 'لي' || tokens[0] === 'ل') tokens.shift();
    if (!tokens.length) return null;

    let quantity = null;
    let quantityIdx = -1;
    let unit = null;
    let unitIdx = -1;

    // Find quantity
    for (let i = 0; i < tokens.length; i++) {
      const q = parseArabicQuantity(tokens[i]);
      if (q !== null && Number.isFinite(q)) { quantity = q; quantityIdx = i; break; }
      const cleaned = tokens[i].replace(/ة/g, 'ة');
      if (ARABIC_NUMBERS[cleaned] !== undefined) { quantity = ARABIC_NUMBERS[cleaned]; quantityIdx = i; break; }
    }

    if (quantity === null) { quantity = 1; quantityIdx = -1; }

    // Find unit
    const searchStart = quantityIdx >= 0 ? quantityIdx + 1 : 0;
    for (let i = searchStart; i < Math.min(searchStart + 2, tokens.length); i++) {
      const norm = tokens[i].replace(/[أإآ]/g, 'ا').toLowerCase();
      if (UNIT_MAP[norm]) { unit = UNIT_MAP[norm]; unitIdx = i; break; }
      const withoutAl = norm.replace(/^ال/, '');
      if (UNIT_MAP[withoutAl]) { unit = UNIT_MAP[withoutAl]; unitIdx = i; break; }
    }
    if (!unit) unit = 'حبة';

    // Extract product name
    let productTokens;
    if (quantityIdx >= 0 && unitIdx >= 0) { productTokens = tokens.slice(Math.max(quantityIdx, unitIdx) + 1); }
    else if (quantityIdx >= 0) { productTokens = tokens.slice(quantityIdx + 1); if (unitIdx === -1 && productTokens[0] && UNIT_MAP[productTokens[0].replace(/^ال/, '')]) productTokens = productTokens.slice(1); }
    else if (unitIdx >= 0) { productTokens = tokens.slice(unitIdx + 1); }
    else { productTokens = tokens; }

    while (productTokens[0] && ['من', 'عن', 'على', 'إلى', 'الى', 'في', 'بـ', 'ب'].includes(productTokens[0])) productTokens.shift();
    let product = productTokens.join(' ').trim();
    if (!product) product = tokens.join(' ').trim();

    return {
      quantity: Number(quantity), unit, unitNormalized: unit, product,
      raw: String(rawText).trim(), quantityNormalized: Number(quantity),
      language: LANGUAGES[0],
    };
  }

  // ═══ Voice Recognition ═══
  let recognition = null;
  let recognitionLang = LANGUAGES[0];
  let isListening = false;

  function createRecognition() {
    if (!SpeechRecognition) return null;
    const rec = new SpeechRecognition();
    rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 1; rec.lang = recognitionLang;
    return rec;
  }

  function dispatchAddToCart(detail) {
    const ev = new CustomEvent('DyPOS:voice-add-to-cart', { detail, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
    const ev2 = new CustomEvent('voice-pos:add', { detail, bubbles: true });
    window.dispatchEvent(ev2);
    return ev;
  }

  function handleTranscript(transcript) {
    const parsed = parseVoiceCommand(transcript);
    if (!parsed) return null;
    dispatchAddToCart(parsed);
    return parsed;
  }

  function startListening(opts = {}) {
    if (!SpeechRecognition) { if (typeof window.toast === 'function') window.toast('المتصفح لا يدعم التعرف الصوتي — استخدم Chrome أو Edge', 'bad'); return false; }
    if (isListening) return true;
    const lang = opts.lang || recognitionLang;
    if (LANGUAGES.includes(lang)) recognitionLang = lang;
    recognition = createRecognition();
    if (!recognition) return false;

    recognition.onstart = () => { isListening = true; updateMicUI(true); if (opts.onStart) opts.onStart(); };
    recognition.onend = () => { isListening = false; updateMicUI(false); if (opts.onEnd) opts.onEnd(); };
    recognition.onerror = (e) => {
      isListening = false; updateMicUI(false);
      const msg = e.error === 'not-allowed' ? 'تم رفض الإذن للميكروفون' : e.error === 'no-speech' ? 'لم يُسمع أي صوت' : 'خطأ تعرف صوتي: ' + (e.error || 'غير معروف');
      if (typeof window.toast === 'function') window.toast(msg, 'bad');
      if (e.error === 'language-not-supported' && recognitionLang === 'ar-SA') { recognitionLang = 'ar-YE'; setTimeout(() => startListening(opts), 600); }
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript || '';
      const parsed = handleTranscript(transcript);
      if (typeof window.toast === 'function') window.toast(`سمعت: "${transcript}" → ${parsed ? `${parsed.quantity} ${parsed.unit} ${parsed.product}` : 'غير مفهوم'}`, parsed ? 'ok' : 'warn');
    };
    try { recognition.start(); } catch (err) { console.warn('[voice-pos] start failed', err); return false; }
    return true;
  }

  function stopListening() {
    if (recognition && isListening) { try { recognition.stop(); } catch {} }
    isListening = false;
    updateMicUI(false);
  }

  function updateMicUI(active) {
    const btn = document.getElementById('voicePosBtn');
    if (!btn) return;
    btn.classList.toggle('listening', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.title = active ? 'يستمع… قل: بيع 2 كراتين ماء' : 'اضغط وتحدث: بيع 2 كراتين ماء';
    const dot = btn.querySelector('.voice-dot');
    if (dot) dot.style.background = active ? '#EF4444' : '#10B981';
    const lbl = btn.querySelector('.voice-lbl');
    if (lbl) lbl.textContent = active ? 'يستمع…' : 'تحدث للبيع';
  }

  function injectMicButton() {
    let host = document.querySelector('[data-voice-pos-host]') || document.getElementById('content') || document.body;
    if (document.getElementById('voicePosBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'voicePosBtn'; btn.type = 'button'; btn.className = 'voice-pos-btn';
    btn.setAttribute('aria-label', 'تحدث للبيع'); btn.title = 'اضغط وتحدث: بيع 2 كراتين ماء';
    btn.innerHTML = `<span class="voice-dot" style="width:10px;height:10px;border-radius:50%;background:#10B981;display:inline-block;flex-shrink:0"></span> <span class="voice-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#D4AF37" stroke-width="1.7"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v3"/><path d="M8 21h8"/></svg></span> <span class="voice-lbl">تحدث للبيع</span>`;
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1px solid rgba(212,175,55,.22);background:rgba(212,175,55,.08);color:var(--txt);font-weight:700;font-size:13px;cursor:pointer;backdrop-filter:blur(8px);transition:all .2s;';
    btn.addEventListener('click', () => { if (isListening) stopListening(); else startListening(); });
    const posHost = document.querySelector('.topbar-tools') || host;
    if (posHost === host && host.id === 'content') { btn.style.position = 'fixed'; btn.style.bottom = '86px'; btn.style.right = '16px'; btn.style.zIndex = '30'; btn.style.boxShadow = '0 8px 32px rgba(0,0,0,.18)'; document.body.appendChild(btn); }
    else { posHost.prepend(btn); }
  }

  function init() {
    if (!SpeechRecognition) console.warn('[voice-pos] Web Speech API غير مدعوم');
    injectMicButton();
    const obs = new MutationObserver(() => { if (!document.getElementById('voicePosBtn')) injectMicButton(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.VoicePOS = {
    parse: parseVoiceCommand, handleTranscript, start: startListening, stop: stopListening,
    isSupported: !!SpeechRecognition,
    get listening() { return isListening; },
    get lang() { return recognitionLang; }, set lang(v) { if (LANGUAGES.includes(v)) recognitionLang = v; },
    languages: LANGUAGES, dispatchAddToCart, simulate: handleTranscript,
  };
})();
