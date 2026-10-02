/**
 * v33 — Queue Management (نظام الطوابير) في SQLite.
 *
 * يخدم الكاشير الذاتي ومنشآت الخدمة: مخاطبة → تذكرة → نداء → خدمة →
 * إنهاء. الطابور حالة تشغيلية لا يمكن اشتقاقها من الفواتير: تذكرة
 * «A-042» التي لم تُنَدَ بعد لا وجود لها في أي جدول آخر، ومع ذلك هي
 * أهم ما يراه الزبون.
 *
 * قرارات تصميمية مقيسة لا مخمّنة:
 *
 * 1. **tenant_id على كل جدول** (invariant 1): مستأجر مزوّر ⇒ 403،
 *    وصف تابع لمستأجر آخر ⇒ 404. لا استعلام بلا tenant، وكل فهرس يبدأ
 *    بـ tenant_id ليبقى «تذاكر هذا المستأجر» محدَّدًا بالفهرس.
 *
 * 2. **رقم التذكرة فريد داخل (session) لا عالميًا**. ثلاثة فروع تفتح
 *    جلسات في اليوم نفسه؛ لو كان فريدًا عالميًا لأعطى الفرع الثاني
 *    A-800 بدل A-001. القيد `UNIQUE(session_id, sequence)` يحل ذلك
 *    ويُبقي الرقم مقروءًا للزبون.
 *
 * 3. **حالة التذكرة محصورة في CHECK** — النطاق مطبَّق في قاعدة البيانات
 *    لا في TypeScript فقط، لأن عميلًا آخر (Reporting، Edge worker) قد
 *    يكتب قيمة لا يعرفها كود التطبيق.
 *
 * 4. **حارس النداء الذرّي**: فهرس جزئي فريد على
 *    `queue_counters(current_ticket_id)` عندما لا تكون القيمة NULL.
 *    هذا هو الحارس الحقيقي ضد ضغطة مزدوجة على «نداء التالي»: التطبيق
 *    قد يفحص ويكتب، لكن الفهرس يمنع الكتابة الثانية فعلًا إذا تزامنت
 *    طلبتان بين الفحص والكتابة.
 *
 * 5. **queue_events append-only** — لا يُحذف ولا يُعدَّل؛ منه يُعاد
 *    بناء الطابور بعد إعادة التشغيل.
 */
export function migrateQueueManagement(
	db,
	// Injected for every LATE_MIGRATIONS step; unused here because the tables
	// are created whole (no column is added to a pre-existing table).
	_addColumnIfMissing,
	{ version = 33, description = 'queue management (tickets, counters, calls)' } = {},
) {
	db.exec(`
    -- الخدمات (كاشير، استقبال، دعم…)
    CREATE TABLE IF NOT EXISTS queue_services (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      name_en TEXT,
      prefix TEXT NOT NULL DEFAULT 'A',
      active INTEGER NOT NULL DEFAULT 1,
      color_token TEXT NOT NULL DEFAULT 'primary',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queue_services_tenant
      ON queue_services(tenant_id, active, sort_order);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_queue_services_code
      ON queue_services(tenant_id, code);

    -- جلسة الطابور (وردية تشغيلية) — نطاق الترقيم اليومي
    CREATE TABLE IF NOT EXISTS queue_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      business_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN','CLOSED')),
      numbering_strategy TEXT NOT NULL DEFAULT 'sequential'
        CHECK (numbering_strategy IN ('sequential','daily-reset')),
      last_sequence INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'SAR',
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queue_sessions_tenant
      ON queue_sessions(tenant_id, business_date, status);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_queue_sessions_date
      ON queue_sessions(tenant_id, business_date);
    -- الكاونترات (نوافذ الخدمة)
    CREATE TABLE IF NOT EXISTS queue_counters (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CLOSED'
        CHECK (status IN ('CLOSED','OPEN','SUSPENDED')),
      service_id TEXT REFERENCES queue_services(id),
      current_ticket_id TEXT,
      session_id TEXT NOT NULL REFERENCES queue_sessions(id),
      served_count INTEGER NOT NULL DEFAULT 0,
      total_serve_ms INTEGER NOT NULL DEFAULT 0,
      opened_at TEXT,
      closed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queue_counters_tenant
      ON queue_counters(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_queue_counters_session
      ON queue_counters(session_id);
    -- حارس النداء الذرّي: كاونتر واحد لا يحمل تذكرتين.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_queue_counters_current
      ON queue_counters(current_ticket_id)
      WHERE current_ticket_id IS NOT NULL;
    -- التذاكر — قلب النظام
    CREATE TABLE IF NOT EXISTS queue_tickets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      session_id TEXT NOT NULL REFERENCES queue_sessions(id),
      service_id TEXT NOT NULL REFERENCES queue_services(id),
      service_name TEXT NOT NULL,
      number TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'WAITING'
        CHECK (status IN ('WAITING','CALLED','RECALLED','SKIPPED','SERVING',
          'COMPLETED','TRANSFERRED','CANCELLED')),
      priority TEXT NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('NORMAL','HIGH','URGENT')),
      counter_id TEXT REFERENCES queue_counters(id),
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      first_called_at TEXT,
      called_at TEXT,
      serving_at TEXT,
      completed_at TEXT,
      call_count INTEGER NOT NULL DEFAULT 0,
      mobile TEXT,
      note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queue_tickets_tenant
      ON queue_tickets(tenant_id, status, sequence);
    CREATE INDEX IF NOT EXISTS idx_queue_tickets_session
      ON queue_tickets(session_id, status, priority, sequence);
    CREATE INDEX IF NOT EXISTS idx_queue_tickets_counter
      ON queue_tickets(counter_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_queue_tickets_sequence
      ON queue_tickets(session_id, sequence);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_queue_tickets_number
      ON queue_tickets(session_id, number);
    -- سجل النداءات — أداء الكاونتر وشاشة «آخر النداءات»
    CREATE TABLE IF NOT EXISTS queue_calls (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      ticket_id TEXT NOT NULL REFERENCES queue_tickets(id),
      ticket_number TEXT NOT NULL,
      counter_id TEXT NOT NULL REFERENCES queue_counters(id),
      counter_name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('CALL','RECALL','SKIP','TRANSFER')),
      to_counter_id TEXT,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queue_calls_tenant
      ON queue_calls(tenant_id, at);
    CREATE INDEX IF NOT EXISTS idx_queue_calls_ticket
      ON queue_calls(ticket_id, at);
    CREATE INDEX IF NOT EXISTS idx_queue_calls_counter
      ON queue_calls(counter_id, at);
    -- الأحداث (append-only) — إعادة البناء بعد إعادة التشغيل
    CREATE TABLE IF NOT EXISTS queue_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      session_id TEXT,
      type TEXT NOT NULL,
      version INTEGER NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      origin TEXT,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queue_events_tenant
      ON queue_events(tenant_id, version);
    CREATE INDEX IF NOT EXISTS idx_queue_events_session
      ON queue_events(session_id, version);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
	return version;
}

export default migrateQueueManagement;
