أنت الآن تعمل كمهندس معماري ومطور Enterprise Production لنظام DyPOS.

المهمة:
إكمال نظام Queue Management الموجود في:
src/components/selfCheckout/queue

الهدف النهائي:
نظام طوابير إنتاجي حقيقي متكامل مع Self Checkout والكاشير الذكي والنداء الصوتي وشاشات العملاء ولوحة التحكم وRealtime، وليس مجرد Components أو Mock UI.

قواعد إلزامية:

1. افحص المشروع الحالي ومصدر الحقيقة أولاً:
   - package.json
   - src
   - selfCheckout
   - cashier / POS
   - state management
   - API / services
   - realtime
   - authentication / permissions
   - design-system
   - أي Queue أو Calling أو Voice أو Display موجود مسبقاً.
   لا تنشئ بديلاً لما هو موجود.

2. ابنِ Queue Domain حقيقي:
   Ticket → Waiting → Called → Serving → Completed
                     ↘ Recalled
                     ↘ Skipped
                     ↘ Transferred
   مع State Machine صارمة تمنع الانتقالات غير الصحيحة والتكرار والتعارض.

3. اجعل Queue هو Single Source of Truth.
   ممنوع وجود Queue state مستقل في عدة Components.
   ممنوع Mock data.
   ممنوع localStorage كمصدر حقيقة تشغيلي.
   ممنوع hardcoded tickets أو counters.
   ممنوع duplicate services أو duplicate stores.

4. اربط النظام فعلياً بالكاشير الذكي:
   - تحديد الكاشير/Counter.
   - فتح وإغلاق جلسة الكاشير.
   - Call Next.
   - Recall.
   - Skip.
   - Start Serving.
   - Complete.
   - Transfer.
   - معرفة Current Ticket.
   - منع استدعاء نفس التذكرة مرتين بسبب race condition.
   - تحديث الواجهة فورياً بعد كل mutation.

5. أنشئ Event-driven Queue flow:
   TicketCreated
   TicketCalled
   TicketRecalled
   TicketServing
   TicketSkipped
   TicketCompleted
   TicketTransferred
   CounterOpened
   CounterClosed
   QueueUpdated

   كل Event يجب أن يكون typed وقابلاً للتتبع ولا يسبب duplicate processing.

6. اربط Realtime الحقيقي الموجود في المشروع.
   استخدم adapter/contract الموجود إن وجد.
   لا تنشئ WebSocket/Realtime system جديداً إذا كان المشروع يحتوي على واحد.
   يجب معالجة:
   reconnect
   stale events
   duplicate events
   ordering
   connection loss
   recovery / resync.

7. ابنِ النداء الصوتي كطبقة مستقلة:
   Queue → Announcement Engine → Voice Provider.
   لا تربط Domain مباشرة بـ browser speech API.
   ادعم:
   - العربية
   - الإنجليزية
   - RTL/LTR
   - رقم التذكرة
   - رقم الكاونتر
   - إعادة النداء
   - queue announcements
   - منع تداخل الأصوات
   - queue صوتية منظمة
   - fallback عند فشل مزود الصوت
   - إمكانية إضافة Provider آخر مستقبلاً.

8. أنشئ Customer Display حقيقي:
   - Now Serving
   - Counter
   - Recently Called
   - Waiting Numbers
   - حالة الاتصال
   - تحديث Realtime
   - دعم الشاشات الكبيرة والصغيرة
   - RTL/LTR
   - accessibility
   - لا تعتمد على polling إذا كان Realtime متاحاً.

9. أنشئ Dashboard تشغيلي وليس Dashboard شكلياً:
   - إجمالي المنتظرين
   - قيد الخدمة
   - تم إنجازهم
   - المتجاوزون
   - متوسط الانتظار
   - متوسط الخدمة
   - أداء الكاونترات
   - حالة الكاونترات
   - آخر النداءات
   - صحة Realtime
   - صحة Voice
   - بيانات لحظية دقيقة.
   لا تعرض أي رقم غير مستند إلى مصدر بيانات حقيقي.

10. طبّق concurrency protection:
   Call Next يجب أن يكون atomic قدر الإمكان.
   امنع:
   - double click
   - duplicate call
   - stale cashier state
   - conflicting cashier actions
   - race conditions.
   استخدم idempotency/event identifiers عند الحاجة بما يتوافق مع البنية الحالية.

11. طبّق Error Architecture:
   أخطاء Domain
   أخطاء Validation
   أخطاء API
   أخطاء Realtime
   أخطاء Voice
   أخطاء Permission
   أخطاء Network
   مع رسائل مستخدم واضحة وlogging مناسب دون تسريب بيانات حساسة.

12. اربط الصلاحيات الموجودة فعلياً:
   cashier
   supervisor
   manager/admin
   ولا تخترع نظام صلاحيات جديداً إذا كان المشروع يحتوي على Authorization قائم.

13. استخدم Design System الموجود في DyPOS.
   لا تنشئ CSS framework جديداً.
   لا تضف overrides عشوائية.
   لا تستخدم inline styling إذا كان النظام الحالي يوفر tokens/components.
   التزم بالـRTL/LTR والـresponsive/accessibility.

14. الأداء:
   - لا إعادة render غير ضرورية.
   - selectors دقيقة.
   - memoization عند الحاجة فقط.
   - lazy loading للميزات الثقيلة.
   - لا polling زائد.
   - لا subscriptions متكررة.
   - cleanup كامل للlisteners/subscriptions/audio.
   - لا memory leaks.
   - لا تحميل صوت أو بيانات غير ضرورية.
   - لا blocking operations في UI.

15. البيانات:
   لا تغير Database schema ولا تنشئ migrations إلا إذا كان ذلك ضرورياً ومؤيداً ببنية المشروع الحالية.
   إذا احتاجت العملية backend capability غير موجودة، حدّد نقطة التكامل بدقة ولا تخترع endpoint.
   استخدم contracts/types المتوافقة مع API الحقيقي.

16. الاختبارات:
   أضف أو حدّث اختبارات منطق Queue خصوصاً:
   - state transitions
   - call next
   - recall
   - skip
   - complete
   - transfer
   - duplicate prevention
   - race conditions
   - realtime events
   - voice queue
   - permissions
   - reconnect/resync.
   لا تعتبر نجاح TypeScript وحده دليلاً على جاهزية النظام.

17. TypeScript:
   strict typing.
   ممنوع any إلا في نقطة تكامل موثقة ومبررة.
   لا duplicate interfaces.
   type definitions تكون canonical.
   لا circular dependencies.

18. Architecture:
   UI
      ↓
   Feature Hooks
      ↓
   Application Use Cases
      ↓
   Domain
      ↓
   Contracts
      ↓
   Infrastructure Adapters

   لا تسمح بأن تستورد Components مباشرة من infrastructure إذا كان ذلك يخالف الحدود المعمارية.

19. افحص الملفات التي أنشأتها البنية السابقة.
   لا تترك ملفات فارغة لمجرد اكتمال الشكل.
   إذا كان ملف غير مطلوب فعلياً احذفه.
   إذا كان هناك ملف/خدمة موجودة بالفعل خارج queue وتؤدي نفس الوظيفة، استخدمها بدلاً من إنشاء نسخة ثانية.

20. الإنتاج النهائي:
   النظام يجب أن يكون:
   Modular
   Canonical
   Typed
   Accessible
   Responsive
   RTL/LTR
   Realtime
   Fault tolerant
   Secure
   Observable
   Performant
   Maintainable
   Production-ready.

21. لا تنفذ تغييرات تجميلية منفصلة عن الهدف.
   لا تنشئ تقارير مطولة بدلاً من العمل.
   لا تكتفِ بتحليل المشروع.
   نفّذ التعديلات الفعلية اللازمة.

22. قبل أي تعديل:
   افحص العلاقات والimports والـservices الحالية.
   حافظ على التوافق مع النظام.
   لا تكسر أي POS/Self Checkout workflow قائم.

23. بعد التنفيذ:
   شغّل typecheck/lint/tests/build المتاحة فعلياً في المشروع.
   أصلح الأخطاء الناتجة.
   افحص imports والمسارات والدوائر dependency cycles.
   تحقق من عدم وجود duplicate implementations.

24. النتيجة النهائية المطلوبة:
   Queue Management يعمل فعلياً كجزء أصيل من DyPOS:
   
   Self Checkout
        ↓
   Ticket
        ↓
   Queue Engine
        ↓
   Smart Cashier
        ↓
   Call / Serve / Complete
        ↓
   Realtime Event Bus
        ├── Voice Announcement
        ├── Customer Display
        └── Operations Dashboard

نفّذ العمل على الكود الحقيقي الموجود.
لا تستخدم Mock.
لا تخترع APIs.
لا تنشئ Database جديدة.
لا تنشئ State Management موازياً.
لا تكرر أي خدمة موجودة.
لا تستبدل بنية المشروع بلا سبب.
حافظ على التوافق، وارفع النظام إلى مستوى Enterprise Production فعلي.
