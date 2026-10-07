# DyPOS Documentation

Welcome to the DyPOS documentation directory. This folder contains comprehensive guides for developers and contributors.

## 📚 Available Documentation

### User Guides
- **[LOCALIZATION.md](LOCALIZATION.md)** - Language settings guide
  - Configuring allowed languages
  - Using the language switcher
  - Available languages
  - Troubleshooting

- **[Wallet-Loyalty-User-Guide.md](Wallet-Loyalty-User-Guide.md)** - Wallet and loyalty system user guide

- **[OFFERS_AND_PROMOTIONS.md](OFFERS_AND_PROMOTIONS.md)** - Offers and promotions system
  - Pricing Rules and Promotional Schemes integration
  - Mixed Conditions configuration
  - Frontend architecture (stores, flow)
  - Backend API reference
  - Troubleshooting guide

### Roadmap
- **[V2_PLAN.md](V2_PLAN.md)** - خطة الإصدار الثاني (ZATCA، لوحة التحليل، KDS، الدفعات الرقمية، Offline 2.0، الموثوقية)

### Architecture (constitution — read first)
- **[OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md)** - دستور Offline-First
  - المبدأ: الخادم اختياري وحصري للمزامنة
  - `Server is optional (sync-only)` — ما يفعله الخادم وما لا يفعله أبدًا
  - تسلسل الإقلاع المحلي والمحظورات عند الإقلاع
- **[FUNCTIONAL_NONFUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_NONFUNCTIONAL_REQUIREMENTS.md)** - المواصفة النظامية
  - المتطلبات الوظيفية (بيع، مخزون، دفعات، مزامنة، ضرائب، تدقيق)
  - NFR-OFF-001…004 — توفّر العمل دون شبكة (P0 مطلق)
  - بوابات القبول في الإنتاج
- **[COMPLIANCE_AND_STANDARDS_MATRIX.md](COMPLIANCE_AND_STANDARDS_MATRIX.md)** - مصفوفة المعايير
- **[OFFLINE_ARCHITECTURE note]** سلامة النزاهة دون اتصال (معرّفات عمليات مستقرة)

- **[STARTUP_SEQUENCE.md](STARTUP_SEQUENCE.md)** - Application initialization flow (offline-first)
  - Local session resolution — no network request
  - CSRF only when linked (`isLinkEnabled()`)
  - Bootstrap data preloading (background, failure-tolerant)
  - Consent-gated subsystems (sync, realtime, SSE, watchdog)

- **[OFFLINE_SYNC.md](OFFLINE_SYNC.md)** - Offline invoice synchronization system
  - Architecture overview
  - Deduplication mechanism (offline_id)
  - Data flow diagrams
  - API reference (server/routes/method.js)
  - IndexedDB schema
  - Troubleshooting guide

- **[PRICING_AND_SUBMISSION.md](PRICING_AND_SUBMISSION.md)** - Pricing and invoice submission flow
  - Rate vs Price List Rate concepts
  - Tax modes (inclusive/exclusive)
  - Discount handling (item-level and cart-level)
  - Frontend and backend function reference
  - Offline mode pricing
  - Pricing rules integration
  - Troubleshooting guide

### Version Control
- **[VERSION_CONTROL.md](VERSION_CONTROL.md)** - Complete guide to the version control system
  - Architecture overview
  - Version types and strategies
  - Build process details
  - Release procedures
  - API reference
  - Troubleshooting

- **[QUICKSTART_VERSION.md](QUICKSTART_VERSION.md)** - Quick reference for version management
  - Common commands
  - Quick workflows
  - File locations
  - Troubleshooting tips

## 🚀 Quick Links

### For Developers

**Check current version:**
```bash
cd /home/ubuntu/dypos-bench
bench --site nexus.local execute DyPOS.utils.get_app_version
```

**Bump version:**
```bash
cd /home/ubuntu/dypos-bench/apps/DyPOS
./scripts/version-bump.sh patch  # or minor/major
```

**Build frontend:**
```bash
cd POS
yarn build
```

### For Contributors

- See [VERSION_CONTROL.md](VERSION_CONTROL.md) for release process
- See [QUICKSTART_VERSION.md](QUICKSTART_VERSION.md) for common tasks

## 📝 Documentation Structure

```
docs/
├── README.md                        # This file
├── LOCALIZATION.md                  # Language settings user guide
├── OFFERS_AND_PROMOTIONS.md         # Offers and promotions system
├── OFFLINE_SYNC.md                  # Offline invoice sync system
├── PRICING_AND_SUBMISSION.md        # Pricing and invoice submission flow
├── STARTUP_SEQUENCE.md              # Application initialization flow
├── VERSION_CONTROL.md               # Comprehensive version control guide
├── QUICKSTART_VERSION.md            # Quick reference guide
├── Wallet-System-Technical-Guide.md # Wallet system technical docs
└── Wallet-Loyalty-User-Guide.md     # Wallet and loyalty user guide
```

## 🔗 External Resources

- [DyPOS Repository](https://github.com/your-org/DyPOS)
- [DyPOS Documentation](https://docs.DyPOS.com)
- [DyPOS Documentation](https://dypos.smartportssoft.com/)
- [Vite Documentation](https://vitejs.dev)

## 📧 Support

For questions or issues:
- Open an issue on GitHub
- Contact: support@brainwise.me

## 🤝 Contributing

When adding new documentation:
1. Place `.md` files in this `docs/` folder
2. Update this README with links to new docs
3. Follow the existing documentation style
4. Include code examples where appropriate
5. Add troubleshooting sections


## ⚖️ المركز القانوني والسياسات — DyPOS 2.0

الوثائق التجارية والقانونية المرجعية:

- [مركز السياسات القانونية](LEGAL_CENTER.md)
- [سياسة الخصوصية](PRIVACY_POLICY.md)
- [شروط وأحكام الاستخدام](TERMS_OF_SERVICE.md)
- [سياسة الاشتراك والأرصدة](SUBSCRIPTION_CREDITS_POLICY.md)
- [سياسة الإلغاء والاسترداد](REFUND_AND_CANCELLATION_POLICY.md)
- [سياسة ملفات الارتباط والتخزين المحلي](COOKIES_AND_LOCAL_STORAGE_POLICY.md)
- [سياسة الاستخدام المقبول](ACCEPTABLE_USE_POLICY.md)
- [الإشعارات والتواصل القانوني](LEGAL_CONTACT_AND_NOTICES.md)
- [الترخيص والملكية](../license.txt)

**تنبيه:** DyPOS منتج تجاري مملوك وليس مجانيًا أو مفتوح المصدر. الأرصدة المجانية جزء من نموذج الخدمة ولا تغيّر طبيعة الترخيص.
