# MASTER PROMPT v2 — ADAPTIVE COMMERCE OPERATING SYSTEM

## Nuclear Edition — Offline-First • AI-Native • Capability-Driven • Self-Configuring • SaaS

أنت الآن تعمل كـ **Principal Architect + Staff Engineer + Product Strategist + AI Systems Engineer + UX Engineer** لبناء منصة تجارية تشغيلية من الجيل التالي.

لا أريد منك بناء POS تقليدي.

لا أريد مجموعة شاشات لكل قطاع.

لا أريد Restaurant POS + Tailoring POS + Pharmacy POS + Salon POS كأنها أنظمة منفصلة.

أريد بناء:

# ADAPTIVE COMMERCE OPERATING SYSTEM

منصة واحدة تفهم كيف تعمل المنشأة، ثم تقوم بتركيب بيئة التشغيل المناسبة لها تلقائيًا.

---

# 1. القاعدة المعمارية الكبرى

احفظ هذه القاعدة أثناء كل التطوير:

> **DO NOT BUILD INDUSTRY MODULES. BUILD REUSABLE BUSINESS CAPABILITIES.**

> **DO NOT BUILD MORE SCREENS. BUILD LESS WORK.**

> **DO NOT MAKE THE USER CONFIGURE THE SOFTWARE. MAKE THE SOFTWARE UNDERSTAND THE BUSINESS.**

> **DO NOT BUILD A CASHIER. BUILD A BUSINESS ACCELERATOR.**

> **DO NOT HARD-CODE INDUSTRIES. MODEL BUSINESS BEHAVIOR.**

أي ميزة جديدة يجب أن تكون قابلة لإعادة الاستخدام بين أكثر من نوع منشأة.

---

# 2. CORE PLATFORM

أنشئ Core موحدًا يحتوي على:

* Product Engine
* Variant Engine
* Service Engine
* Customer / Party Engine
* Supplier Engine
* Employee / Resource Engine
* Pricing Engine
* Promotion Engine
* Order Engine
* Cart Engine
* Payment Engine
* Ledger Engine
* Inventory Engine
* Stock Movement Engine
* Work Order Engine
* Production Engine
* Workflow Engine
* Rules Engine
* Scheduling Engine
* Appointment Engine
* Measurement Engine
* Subscription Engine
* Membership Engine
* Rental Engine
* Delivery Engine
* Commission Engine
* Document Engine
* Notification Engine
* Search Engine
* Query Engine
* Reporting Engine
* Analytics Engine
* Audit Engine
* Device / IoT Engine
* AI Engine
* Automation Engine
* Tenant Configuration Engine

كل Engine يجب أن يكون مستقلًا، قابلًا للتركيب، وقابلًا لإعادة الاستخدام.

---

# 3. CAPABILITY ARCHITECTURE

لا تستخدم:

```text
RestaurantModule
TailoringModule
PharmacyModule
SalonModule
```

كمعمارية أساسية.

بدلًا منها:

```text
CAPABILITY:
- SellGoods
- SellServices
- TakeMeasurements
- TrackSerialNumbers
- TrackBatches
- TrackExpiry
- ScheduleAppointments
- ManageWorkOrders
- ProduceItems
- ManageSubscriptions
- ManageMemberships
- WeighItems
- ManageReservations
- ManageRentals
- ManageDelivery
- ManageCommissions
- ManagePrescriptions
- ManageFittings
- ManageRepairs
- ManageInstallations
- ManageConsignment
- ManageCustomerCredit
- ManageThirdPartySales
```

ثم يتم تركيب الـCapabilities حسب النشاط.

---

# 4. BUSINESS BEHAVIOR MODEL

النظام يجب أن يفهم المنشأة عبر:

```text
Entities
+
Capabilities
+
Relationships
+
Workflows
+
Rules
+
Resources
+
Roles
+
Devices
+
Documents
+
Events
+
Metrics
```

مثال:

محل خياطة لا يتم تعريفه فقط باسم "Tailor".

بل يمكن تمثيله:

```text
SellGoods
+
SellServices
+
CustomerMeasurements
+
DesignSelection
+
MaterialTracking
+
WorkOrder
+
Production
+
Fitting
+
Alteration
+
Deposit
+
Delivery
+
CustomerHistory
```

ومحل نظارات:

```text
SellGoods
+
Prescription
+
Measurements
+
LensConfiguration
+
ProductionOrder
+
SupplierOrder
+
Delivery
```

ومغسلة:

```text
Service
+
ItemIntake
+
Barcode
+
Weight
+
WorkOrder
+
ProcessingStages
+
QualityCheck
+
Delivery
+
CustomerNotification
```

لا تبنِ ثلاثة أنظمة.

ابنِ Capabilities مشتركة.

---

# 5. AI BUSINESS CONFIGURATION ENGINE

هذه من أهم أجزاء النظام.

عند تسجيل منشأة جديدة، لا تجعل المستخدم يختار عشرات الإعدادات.

اسأله أسئلة بسيطة جدًا مثل:

```text
ماذا تبيع؟
كيف تستقبل الطلبات؟
هل لديك خدمات؟
هل تصنع منتجات؟
هل تستخدم مقاسات؟
هل يوجد مواعيد؟
هل يوجد توصيل؟
هل يوجد اشتراكات؟
هل يوجد موظفون يعملون على الطلبات؟
هل يوجد مخزون؟
هل توجد مواد خام؟
هل يوجد بيع بالوزن؟
هل توجد أرقام تسلسلية؟
هل توجد صلاحية؟
```

ثم يقوم AI بتحويل الإجابات إلى:

```text
Tenant Profile
Capabilities
Workflows
Roles
Permissions
Fields
Statuses
Documents
Reports
Dashboards
Devices
Automations
Notifications
Rules
```

بدون إجبار المستخدم على فهم النظام.

---

# 6. SELF-CONFIGURING BUSINESS OS

يجب أن يستطيع النظام استنتاج:

* ما العمليات الموجودة؟
* من ينفذها؟
* ما المدخلات؟
* ما المخرجات؟
* ما الحالات؟
* ما التأخيرات؟
* ما الأخطاء المتكررة؟
* ما الموارد المطلوبة؟
* ما الأجهزة المتاحة؟
* ما البيانات المهمة؟

ثم يقترح تحسينات.

مثال:

إذا لاحظ النظام أن الموظف يسجل:

```text
الاسم
الهاتف
المقاس
القماش
التصميم
العربون
موعد التسليم
```

بشكل متكرر، يجب أن يقترح إنشاء:

```text
Quick Order Template
```

ويحوّل العملية إلى Workflow سريع.

---

# 7. UNIVERSAL ORDER ENGINE

الطلب ليس مجرد فاتورة.

Order يجب أن يدعم:

```text
Quote
Draft
Order
Deposit
Payment
Production
Processing
Approval
Fitting
Repair
Delivery
Pickup
Cancellation
Return
Refund
Completion
```

والطلب قد يكون:

* منتجًا
* خدمة
* منتجًا + خدمة
* تصنيعًا
* إصلاحًا
* تأجيرًا
* اشتراكًا
* حجزًا
* طلبًا مخصصًا
* طلب طرف ثالث

---

# 8. UNIVERSAL WORK CENTER

لا تنشئ:

```text
Kitchen Screen
```

كحل خاص بالمطاعم.

ابنِ:

# WORK CENTER ENGINE

يمكن تهيئته لأي عملية:

```text
Cutting
Sewing
Embroidery
Laundry
Repair
Packaging
Printing
Production
Quality Control
Fitting
Installation
Preparation
Assembly
```

كل Work Center يدعم:

* Queue
* Priority
* Worker
* Resource
* Status
* SLA
* Deadline
* Dependencies
* Capacity
* Assignment
* Progress
* Quality Check
* Completion

وبذلك يمكن أن يصبح نفس المحرك:

خياطة / مغسلة / ورشة / مطبعة / مخبز / مصنع صغير / إصلاح إلكترونيات.

---

# 9. SMART CASHIER

الكاشير يجب ألا يكون شاشة إدخال.

يجب أن يكون:

# INTELLIGENT TRANSACTION WORKSPACE

يدعم:

* Barcode
* SKU
* Search
* Voice
* Quick Add
* Favorites
* Customer Recognition
* Previous Orders
* Smart Suggestions
* Bundles
* Promotions
* Discounts
* Multiple Payments
* Partial Payments
* Deposits
* Credit
* Refunds
* Returns
* Exchanges
* Split Payment
* Third-party Sale
* Weighing
* Serial Number
* Batch
* Customer-specific pricing

ويجب أن يختصر البيع إلى أقل عدد ممكن من الخطوات.

---

# 10. SMART SEARCH ENGINE

ابنِ Search Engine سريعًا جدًا.

يجب أن يستطيع المستخدم البحث مثل:

```text
قماش أسود
```

أو:

```text
محمد البدلة
```

أو:

```text
الطلبات المتأخرة
```

أو:

```text
جوال سامسونج الذي IMEI...
```

أو:

```text
القطع التي تنتهي هذا الشهر
```

أو:

```text
طلبات أحمد غير المسلمة
```

ويفهم النظام نية البحث.

أنشئ:

```text
Keyword Search
Semantic Search
Structured Query
Natural Language Query
Filters
Facets
Saved Queries
Global Search
```

مع Local Index للعمل Offline.

---

# 11. SMART TAILORING + CLOTHING

يجب أن يكون قطاع الخياطة والملابس من أقوى تطبيقات النظام.

دعم:

### Customer Fit Profile

* Measurements
* Body Profile
* Previous Orders
* Preferred Fit
* Fabric Preferences
* Style Preferences
* Alterations History

### Clothing Matrix

```text
Style
Color
Size
Fabric
Variant
Barcode
SKU
Cost
Price
Stock
```

### Tailoring Workflow

```text
Customer
→ Design
→ Measurement
→ Material
→ Quote
→ Deposit
→ Work Order
→ Cutting
→ Sewing
→ Fitting
→ Alteration
→ QC
→ Final Payment
→ Delivery
```

مع:

* Copy Previous Order
* Repeat Customer
* Reuse Measurements
* Smart Templates
* Deadline Alerts
* Production Queue
* Worker Assignment
* Material Consumption
* Profit per Order
* Alteration Tracking
* Customer Notification

---

# 12. UNIVERSAL MEASUREMENT ENGINE

لا تجعله خاصًا بالخياطة.

صمم Measurement Engine عامًا.

يمكن استخدامه في:

* Tailoring
* Eyewear
* Furniture
* Construction
* Automotive
* Equipment
* Medical/service contexts where appropriate

يدعم:

```text
Measurement Type
Value
Unit
Body/Item Zone
Timestamp
Version
Source
Notes
```

مع حفظ تاريخ القياسات.

---

# 13. PHARMACY CAPABILITIES

عند اكتشاف نشاط صيدلية، قم بتركيب:

* Batch
* Expiry
* FEFO
* Prescription Workflow
* Stock Alerts
* Substitution Rules
* Supplier
* Customer History
* Controlled Workflow where legally applicable
* Reorder
* Recall Tracking
* Purchase/Receiving
* Inventory Audit

لكن لا تنشئ Pharmacy Core منفصلًا.

---

# 14. AUTOMOTIVE WORKSHOP

عند اكتشاف ورشة:

```text
Customer
Vehicle
Mileage
Problem
Inspection
Estimate
Approval
Work Order
Technician
Parts
Labor
Quality Check
Payment
Delivery
```

مع:

* Vehicle History
* Service History
* Parts Compatibility
* Technician Productivity
* Labor Cost
* Parts Margin
* Maintenance Reminder

---

# 15. SALON / BARBERSHOP / SPA

ركّب:

* Appointment
* Resource/Chair
* Staff
* Services
* Customer Profile
* Packages
* Membership
* Commission
* Tips
* Product Sales
* Loyalty
* Reminder
* No-show tracking

---

# 16. LAUNDRY / DRY CLEANING

ركّب:

```text
Item Intake
Barcode
Bag
Weight
Service Type
Stain/Condition
Processing
Quality Control
Pickup
Delivery
Payment
```

مع:

* Lost/Damaged item tracking
* Customer notification
* Due date
* Batch processing

---

# 17. ELECTRONICS / MOBILE

دعم:

* Serial
* IMEI
* Warranty
* Repair
* Device Intake
* Diagnostics
* Parts
* Technician
* Replacement
* Used Device
* Trade-in
* Customer History

---

# 18. HARDWARE / BUILDING MATERIALS

دعم:

* Unit Conversion
* Meter
* Square Meter
* Cubic Meter
* Weight
* Length
* Cutting
* Bundles
* Delivery
* Loading
* Customer Credit
* Project Orders

---

# 19. FOOD / BAKERY / BUTCHERY / WEIGHT-BASED COMMERCE

لا تجعل الطعام يعني Kitchen.

استخدم capabilities:

```text
Recipe
Ingredient
Batch
Production
Expiry
Weight
Yield
Waste
Preorder
Preparation
Packaging
Delivery
```

وبذلك يمكن استخدامها في:

* مخبز
* حلويات
* جزارة
* أسماك
* مطبخ إنتاج
* متجر أغذية

---

# 20. RENTAL ENGINE

يدعم:

* Asset
* Availability
* Reservation
* Rental Period
* Deposit
* Return
* Damage
* Late Fee
* Maintenance
* Customer Liability

ويخدم:

* سيارات
* معدات
* أثاث
* أجهزة
* أدوات
* ملابس مناسبات

---

# 21. SUBSCRIPTION ENGINE

يدعم:

```text
Plan
Customer
Start
End
Renewal
Billing Cycle
Payment
Pause
Resume
Upgrade
Downgrade
Cancellation
Usage
```

لـ:

* Memberships
* Gyms
* SaaS
* Maintenance
* Service plans
* Clubs
* Recurring delivery

---

# 22. THIRD-PARTY SALES / CONSIGNMENT

يجب دعم:

```text
Party A
Party B
Seller
Owner
Supplier
Consignor
Agent
Commission
Settlement
```

حتى يمكن تسجيل:

> من باع؟ لمن؟ ولمن تعود البضاعة؟ وما العمولة؟ وما المستحق؟

مهم جدًا للأسواق والبيع بالعمولة والكونساينمنت.

---

# 23. INVENTORY INTELLIGENCE

المخزون يجب ألا يكون مجرد Quantity.

دعم:

```text
On Hand
Reserved
Available
Incoming
Committed
Damaged
Expired
In Production
In Transit
```

مع:

* Reorder Prediction
* Slow Moving
* Dead Stock
* Fast Moving
* Margin Analysis
* Demand Prediction
* Stockout Prediction
* Purchase Suggestions

---

# 24. AI BUSINESS COPILOT

أضف مساعدًا يفهم بيانات المنشأة.

يمكنه الإجابة:

```text
ما أكثر المنتجات ربحًا؟
ما أكثر المنتجات مبيعًا؟
ما المنتجات الراكدة؟
ما الطلبات المتأخرة؟
من أكثر الموظفين إنتاجية؟
أين يحدث التأخير؟
ما الذي سينفد قريبًا؟
من العملاء الذين لم يعودوا؟
ما أفضل وقت للبيع؟
ما هامش الربح الحقيقي؟
```

ثم لا يكتفي بالإجابة.

بل يقترح:

```text
Action
Automation
Reorder
Discount
Follow-up
Assignment
Schedule
Alert
```

مع موافقة المستخدم على الإجراءات الحساسة.

---

# 25. AI AUTOMATION ENGINE

اسمح بإنشاء قواعد بلغة طبيعية:

```text
إذا تأخر الطلب أكثر من يومين، أخبر المدير.
```

تحول إلى:

```text
Trigger
Condition
Action
Permission
Audit
```

مثال:

```text
IF order.deadline < today
AND order.status != completed
THEN notify manager
```

---

# 26. OFFLINE-FIRST — ABSOLUTE REQUIREMENT

النظام يجب أن يعمل بالكامل Offline.

لا تجعل:

```text
Internet = Application
```

بل:

```text
Local Application
+
Optional Cloud Sync
```

يجب أن يعمل Offline:

* POS
* Inventory
* Search
* Customers
* Orders
* Payments
* Workflows
* Reports الأساسية
* Local AI where practical
* Barcode
* Printing
* Devices

استخدم قاعدة بيانات محلية مناسبة للمنصة.

كل عملية مهمة يجب أن تكون:

```text
Transactional
ACID
Idempotent
Auditable
Recoverable
```

---

# 27. SYNC ENGINE

ابنِ Sync Engine حقيقيًا.

يدعم:

* Delta Sync
* Incremental Sync
* Offline Queue
* Retry
* Idempotency
* Conflict Detection
* Conflict Resolution
* Versioning
* Event Log
* Device Identity
* Sync Checkpoint
* Recovery

لا تفترض أن الإنترنت دائمًا موجود.

---

# 28. LOCAL NETWORK MODE

دعم تشغيل عدة أجهزة داخل المنشأة حتى مع انقطاع الإنترنت:

```text
POS
POS
POS
Back Office
Printer
Scanner
Scale
Local Gateway
```

مع Local Network Discovery وSync.

---

# 29. DEVICE / IoT FABRIC

لا تجعل الأجهزة مرتبطة بقطاع.

ابنِ Device Abstraction Layer.

يدعم:

```text
Barcode Scanner
Receipt Printer
Label Printer
Scale
Customer Display
Cash Drawer
RFID
Camera
Tablet
Mobile
Kiosk
Biometric Device
IoT Sensor
```

كل جهاز يتعامل مع:

```text
Device Driver
Capability
Protocol
Health
Status
Events
Commands
```

---

# 30. PERFORMANCE ENGINEERING

السرعة ليست تحسينًا لاحقًا.

اجعلها Contract.

أهداف مبدئية:

```text
POS interaction → near-instant
Local search → extremely fast
Local transaction → near-instant
UI transition → minimal latency
Sync → background
Heavy reports → background
AI → non-blocking
```

لا تسمح بعملية Cloud تمنع عملية بيع محلية.

لا تجعل AI يحجب الكاشير.

لا تجعل Analytics يعطل Transaction.

---

# 31. SECURITY

Multi-Tenant SaaS آمن.

دعم:

* Tenant Isolation
* RBAC
* Fine-grained Permissions
* Device Authorization
* Session Security
* Encryption
* Audit Log
* Secret Management
* Rate Limiting
* Backup
* Restore
* Data Retention
* Sensitive Data Protection

كل عملية مالية يجب أن تكون قابلة للتدقيق.

---

# 32. UNIVERSAL LEDGER

لا تعتمد فقط على Invoice.

أنشئ Ledger موحدًا لدعم:

* Payments
* Deposits
* Credits
* Customer Balance
* Supplier Balance
* Commissions
* Third-party Settlement
* Refunds
* Adjustments
* Expenses

مع تاريخ كامل للحركة.

---

# 33. BUSINESS VALUE ENGINE

هذه قاعدة إلزامية.

كل Feature جديدة يجب أن تجيب:

```text
How many seconds does it save?
How many clicks does it remove?
How many errors does it prevent?
How much revenue can it create?
How much waste can it reduce?
How much inventory can it optimize?
How many delays can it prevent?
How much training can it eliminate?
```

إذا لم تقدم الميزة قيمة تشغيلية واضحة:

# DO NOT BUILD IT.

---

# 34. ZERO-TRAINING UX

الواجهة يجب أن تكون قابلة للفهم بدون تدريب طويل.

استخدم:

* Smart Defaults
* Contextual Actions
* Progressive Disclosure
* Keyboard Shortcuts
* Barcode-first
* Search-first
* Quick Actions
* Undo
* Intelligent Suggestions
* Natural Language
* Consistent Navigation

المستخدم يجب أن يتعلم النظام أثناء استخدامه.

---

# 35. ADAPTIVE UI

لا تعرض 100 وظيفة لكل منشأة.

الواجهة يجب أن تتغير بناءً على:

```text
Capabilities
Roles
Usage
Workflow
Device
Business Type
User Behavior
```

لكن لا تجعلها غامضة.

يجب أن تكون Adaptive + Predictable.

---

# 36. SMART DASHBOARD

لا تبنِ Dashboard ثابتًا.

Dashboard Engine يولد:

```text
KPIs
Alerts
Queues
Tasks
Revenue
Profit
Inventory
Customers
Operations
Deadlines
Exceptions
```

حسب طبيعة المنشأة ودور المستخدم.

---

# 37. EXCEPTION-FIRST DESIGN

لا تجعل المدير يبحث عن المشاكل.

النظام يجب أن يقول:

```text
5 orders are late.
3 products may stock out tomorrow.
2 high-value customers have not returned.
1 employee queue is overloaded.
7 items have unusual waste.
```

ثم:

```text
Why?
What happened?
What should I do?
Execute?
```

---

# 38. SELF-OPTIMIZATION

راقب الاستخدام.

إذا اكتشفت أن المستخدمين:

* يكررون نفس الخطوات
* يبحثون عن نفس البيانات
* ينسون نفس الخطوة
* يواجهون نفس الأخطاء
* ينشئون نفس التقارير

يقترح النظام:

```text
Shortcut
Template
Automation
Default
Workflow Optimization
```

---

# 39. MULTI-TENANT SAAS

Tenant مستقل منطقيًا.

دعم:

```text
Organization
Branches
Locations
Warehouses
Devices
Users
Roles
Capabilities
Workflows
Settings
Subscriptions
Billing
```

مع إمكانية:

```text
One Organization
→ Multiple Branches
→ Multiple Warehouses
→ Multiple Devices
```

---

# 40. PLUGIN / EXTENSION ARCHITECTURE

يجب أن يمكن إضافة Capability جديدة دون إعادة بناء Core.

مثال:

```text
New Capability
→ Schema
→ Workflow
→ Permissions
→ UI
→ Events
→ Reports
→ Automation
```

بدون نسخ Core.

---

# 41. EVENT-DRIVEN INTERNAL ARCHITECTURE

الأحداث يجب أن تكون من الدرجة الأولى:

```text
OrderCreated
PaymentReceived
StockChanged
WorkStarted
WorkCompleted
CustomerCreated
AppointmentBooked
ItemReceived
ItemDelivered
SubscriptionRenewed
```

ويمكن للـAutomation Engine الاستماع إليها.

---

# 42. OBSERVABILITY

أضف:

* Structured Logs
* Metrics
* Tracing
* Error Tracking
* Sync Health
* Device Health
* Performance Metrics
* Business Metrics
* Audit Events

يجب معرفة:

```text
What failed?
Where?
Why?
For which tenant?
On which device?
Can it recover automatically?
```

---

# 43. SELF-RECOVERY

عند حدوث:

* Sync failure
* Temporary network failure
* Printer failure
* Database issue
* Device disconnect
* Partial operation

حاول:

```text
Detect
Recover
Retry
Queue
Resume
Notify
```

بدل انهيار النظام.

---

# 44. DEVELOPMENT RULES

ممنوع:

* Duplicate business logic
* Hard-coded industry assumptions
* Giant conditional statements
* Sector-specific hacks
* Cloud dependency for basic operations
* UI-first architecture
* Fake AI
* Fake Offline
* Fake Sync
* Fake Analytics
* Unnecessary screens

مسموح:

* Reusable capabilities
* Config-driven workflows
* Schema-driven UI
* Event-driven automation
* Local-first architecture
* AI-assisted configuration
* Modular engines

---

# 45. QUALITY GATE

قبل اعتبار أي Feature مكتملة:

```text
Architecture ✓
Offline ✓
Sync ✓
Security ✓
Performance ✓
UX ✓
Accessibility ✓
Audit ✓
Error Handling ✓
Testing ✓
Multi-Tenant ✓
Observability ✓
```

أي Feature تفشل في أساسيات التشغيل ليست مكتملة.

---

# 46. TESTING

أنشئ اختبارات:

```text
Unit
Integration
Workflow
Offline
Sync
Conflict
Security
Performance
Multi-device
Multi-tenant
Regression
```

اختبر سيناريوهات انقطاع الإنترنت أثناء:

```text
Sale
Payment
Inventory Update
Order Creation
Work Completion
Sync
```

---

# 47. PRODUCT DISCIPLINE

لا تضف Feature لأن المنافس لديه Feature.

اسأل:

```text
Does it reduce work?
Does it increase speed?
Does it reduce errors?
Does it increase revenue?
Does it improve visibility?
Does it automate a repetitive task?
Does it create a reusable capability?
```

إذا كانت الإجابة لا:

# REJECT IT.

---

# 48. PRIORITY MODEL

رتّب التنفيذ بهذا الترتيب:

### P0

Core Transaction Engine
Offline
Local Database
Sync
Security
Tenant
Product
Customer
Order
Payment
Inventory
Search

### P1

Workflow
Work Order
Production
Measurement
Scheduling
Delivery
Ledger
Automation

### P2

AI Copilot
Natural Language Query
Predictive Analytics
Self-Configuration
Self-Optimization

### P3

Advanced IoT
Device Fabric
Computer Vision
Advanced Local AI
Optimization Intelligence

---

# 49. INITIAL VERTICAL VALIDATION

استخدم هذه القطاعات كاختبارات للمعمارية، وليس كنظم منفصلة:

```text
Tailoring / Clothing
Pharmacy
Automotive Workshop
Salon / Barber / Spa
Laundry
Electronics / Mobile
Building Materials / Hardware
Bakery / Food
Butchery / Fish
Furniture
Printing
Eyewear
Jewelry / Watches
Gym / Membership
Hotel / Booking
Rental
Wholesale / Distribution
Clinics / Service Businesses
```

إذا احتاج قطاع جديد إلى نسخ Core أو إنشاء نظام منفصل:

# ARCHITECTURE FAILURE.

عدّل الـCapability Architecture.

---

# 50. ULTIMATE ONBOARDING EXPERIENCE

يجب أن تكون تجربة إنشاء منشأة قريبة من:

```text
Tell us how your business works.
```

ثم AI يقوم بـ:

```text
Understand
→ Model
→ Configure
→ Generate
→ Validate
→ Optimize
```

ويعرض:

```text
Your business environment is ready.
```

بدل:

```text
Choose 47 settings.
```

---

# 51. AI BUSINESS BLUEPRINT

أنشئ مفهوم:

```text
Business Blueprint
```

يحتوي على:

```text
Business Profile
Capabilities
Entities
Relationships
Workflows
Roles
Permissions
Pricing
Inventory Rules
Documents
Devices
Automations
Reports
KPIs
AI Context
```

ويكون Versioned.

مثال:

```text
Blueprint v1
Blueprint v2
Blueprint v3
```

مع إمكانية Rollback.

---

# 52. AI SHOULD LEARN THE BUSINESS

ليس المقصود تدريب نموذج جديد لكل متجر.

بل بناء:

```text
Tenant Context
+
Business Events
+
Usage Patterns
+
Historical Data
+
Rules
+
Approved Actions
```

ليصبح AI أكثر فائدة للمنشأة مع الوقت.

---

# 53. HUMAN-IN-THE-LOOP

AI لا ينفذ العمليات الحساسة المالية أو الإدارية بدون صلاحية واضحة.

قسم الإجراءات:

```text
Suggest
Preview
Approve
Execute
Audit
```

---

# 54. THE FINAL UX PRINCIPLE

بدل:

```text
User
→ Software
→ Many Screens
→ Many Clicks
→ Result
```

اجعلها:

```text
User Intent
→ AI / Smart UI
→ Minimal Actions
→ Result
```

مثال:

بدل إدخال طلب خياطة من 20 خطوة:

```text
"نفس طلب محمد السابق، لكن قماش أسود وموعده الخميس."
```

النظام:

```text
Find Customer
→ Load Previous Order
→ Reuse Measurements
→ Change Fabric
→ Calculate Price
→ Set Deadline
→ Prepare Order
```

مع مراجعة المستخدم قبل الحفظ النهائي إذا لزم.

---

# 55. FINAL ARCHITECTURAL TEST

في نهاية كل Sprint اسأل:

### هل أضفنا Feature؟

أم:

### أضفنا Capability قابلة لإعادة الاستخدام؟

إذا كانت Feature فقط، حاول تحويلها إلى Capability.

---

# 56. FINAL COMMAND TO DEVELOPMENT AGENT

ابدأ بفحص المشروع الحالي بالكامل.

لا تبدأ بكتابة كود عشوائي.

أولًا:

```text
1. Analyze existing architecture.
2. Identify duplicated logic.
3. Identify hard-coded industries.
4. Identify offline weaknesses.
5. Identify performance bottlenecks.
6. Identify missing Core Engines.
7. Identify reusable capabilities.
8. Build a dependency graph.
9. Propose migration strategy.
10. Implement incrementally without breaking existing functionality.
```

ثم نفّذ.

لا تهدم النظام العامل بلا داعٍ.

لا تنشئ طبقة تجميلية فوق Architecture ضعيفة.

أعد بناء الأجزاء التي تمنع التوسع.

---

# NON-NEGOTIABLE END STATE

أريد منصة عندما يدخل إليها:

```text
Tailor
```

تتحول إلى بيئة خياطة.

وعندما يدخل:

```text
Pharmacy
```

تتحول إلى بيئة صيدلية.

وعندما يدخل:

```text
Workshop
```

تتحول إلى بيئة ورشة.

وعندما يدخل:

```text
Laundry
```

تتحول إلى بيئة مغسلة.

وعندما يدخل:

```text
Electronics Store
```

تتحول إلى بيئة إلكترونيات.

لكن في جميع الحالات:

# SAME CORE

# SAME PLATFORM

# SAME DATA MODEL PRINCIPLES

# SAME OFFLINE ENGINE

# SAME SYNC ENGINE

# SAME SECURITY MODEL

# SAME AI ENGINE

# SAME SEARCH ENGINE

# SAME WORKFLOW ENGINE

# DIFFERENT CAPABILITIES

---

# THE NORTH STAR

لا أريد برنامجًا يجعل الموظف يعمل أكثر لإدخال البيانات.

أريد نظامًا يجعل البيانات تعمل لصالح الموظف.

لا أريد Cashier.

أريد:

# BUSINESS ACCELERATOR.

لا أريد Modules.

أريد:

# COMPOSABLE CAPABILITIES.

لا أريد Online POS مع Offline Mode.

أريد:

# OFFLINE-FIRST COMMERCE OS.

لا أريد AI Chatbot داخل POS.

أريد:

# AI THAT UNDERSTANDS, PREDICTS, SUGGESTS, AUTOMATES AND OPTIMIZES THE BUSINESS.

لا أريد أن يختار صاحب المنشأة كيف يبني النظام.

أريد:

# THE SYSTEM UNDERSTANDS HOW THE BUSINESS WORKS AND BUILDS ITS OWN OPERATING ENVIRONMENT.

ابدأ الآن من الكود الموجود، وحافظ على كل ما يعمل، ثم حوّل المعمارية تدريجيًا إلى هذا النموذج.

**DO NOT BUILD MORE SOFTWARE.**

**BUILD A SYSTEM THAT MAKES BUSINESSES RUN BETTER.**
