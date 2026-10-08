/**
 * v41 — Smart POS master/reference foundation.
 * Idempotent reference data only; no demo transactions or fake financial values.
 */
const COUNTRY_CODES = "AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW".split(" ");

const ACTIVITIES = [
 ["RETAIL_GROCERY","RETAIL","Grocery & Supermarket","بقالة وسوبرماركت"],
 ["RETAIL_GENERAL","RETAIL","General Retail","تجزئة عامة"],
 ["RETAIL_FASHION","RETAIL","Fashion & Apparel","ملابس وأزياء"],
 ["RETAIL_ELECTRONICS","RETAIL","Electronics","إلكترونيات"],
 ["RETAIL_PHARMACY","HEALTH","Pharmacy","صيدلية"],
 ["RESTAURANT","FOOD","Restaurant","مطعم"],
 ["CAFE","FOOD","Cafe & Coffee Shop","مقهى وكوفي شوب"],
 ["BAKERY","FOOD","Bakery & Pastry","مخبز وحلويات"],
 ["FAST_FOOD","FOOD","Fast Food","وجبات سريعة"],
 ["WHOLESALE","WHOLESALE","Wholesale","جملة"],
 ["DISTRIBUTION","WHOLESALE","Distribution","توزيع"],
 ["HARDWARE","TRADES","Hardware & Building Materials","مواد بناء وأدوات"],
 ["AUTO_PARTS","AUTOMOTIVE","Auto Parts","قطع غيار سيارات"],
 ["AUTO_SERVICE","AUTOMOTIVE","Auto Service & Workshop","ورشة وصيانة سيارات"],
 ["LAUNDRY","SERVICES","Laundry & Dry Cleaning","مغسلة وتنظيف جاف"],
 ["SALON","BEAUTY","Salon & Barber","صالون وحلاقة"],
 ["HOTEL","HOSPITALITY","Hotel & Accommodation","فندق وإقامة"],
 ["BOOKSTORE","RETAIL","Books & Stationery","مكتبة وقرطاسية"],
 ["MOBILE_STORE","RETAIL","Mobile & Telecom Shop","جوال واتصالات"],
 ["FUEL_STATION","ENERGY","Fuel Station","محطة وقود"],
 ["REPAIR_SHOP","SERVICES","Repair Services","خدمات إصلاح"],
 ["SERVICES_GENERAL","SERVICES","Professional Services","خدمات مهنية"]
];

const CLASSES = [
 ["RETAIL_GROCERY","FOOD","Food & Canned","أغذية ومعلبات"],["RETAIL_GROCERY","BEVERAGES","Beverages","مشروبات"],["RETAIL_GROCERY","HOUSEHOLD","Household & Cleaning","منزلية وتنظيف"],["RETAIL_GROCERY","PERSONAL_CARE","Personal Care","عناية شخصية"],
 ["RETAIL_FASHION","CLOTHING","Clothing","ملابس"],["RETAIL_FASHION","FOOTWEAR","Footwear","أحذية"],["RETAIL_FASHION","ACCESSORIES","Accessories","إكسسوارات"],
 ["RETAIL_ELECTRONICS","DEVICES","Devices","أجهزة إلكترونية"],["RETAIL_ELECTRONICS","ACCESSORIES","Accessories","ملحقات إلكترونية"],["RETAIL_PHARMACY","HEALTH","Health Products","منتجات صحية"],
 ["RESTAURANT","FOOD","Food","أطعمة"],["RESTAURANT","BEVERAGES","Beverages","مشروبات"],["RESTAURANT","EXTRAS","Extras","إضافات"],
 ["CAFE","HOT_DRINKS","Hot Drinks","مشروبات ساخنة"],["CAFE","COLD_DRINKS","Cold Drinks","مشروبات باردة"],["CAFE","DESSERTS","Desserts","حلويات"],
 ["BAKERY","BAKED_GOODS","Baked Goods","مخبوزات"],["BAKERY","CAKES","Cakes & Pastry","كيك وحلويات"],
 ["FAST_FOOD","MEALS","Meals","وجبات"],["FAST_FOOD","SIDES","Sides","أطباق جانبية"],
 ["WHOLESALE","GENERAL","Wholesale Goods","بضائع جملة"],["HARDWARE","BUILDING","Building Materials","مواد بناء"],["HARDWARE","TOOLS","Tools","أدوات وعدد"],
 ["AUTO_PARTS","PARTS","Spare Parts","قطع غيار"],["AUTO_SERVICE","SERVICES","Workshop Services","خدمات صيانة"],
 ["LAUNDRY","GARMENT","Garments","ملابس ومفروشات"],["SALON","SERVICES","Salon Services","خدمات صالون"],["HOTEL","ROOMS","Rooms & Accommodation","غرف وإقامة"],
 ["BOOKSTORE","BOOKS","Books","كتب"],["BOOKSTORE","STATIONERY","Stationery","قرطاسية"],["MOBILE_STORE","DEVICES","Mobile Devices","أجهزة جوال"],["MOBILE_STORE","ACCESSORIES","Mobile Accessories","إكسسوارات جوال"],
 ["FUEL_STATION","FUEL","Fuel","وقود"],["REPAIR_SHOP","REPAIR","Repair","إصلاح"],["SERVICES_GENERAL","SERVICES","Services","خدمات"]
];

const SERVICES = [
 ["RESTAURANT","DINE_IN","Dine-in","داخل المحل"],["RESTAURANT","TAKEAWAY","Takeaway","سفري"],["RESTAURANT","DELIVERY","Delivery","توصيل"],
 ["CAFE","DINE_IN","Dine-in","داخل المقهى"],["CAFE","TAKEAWAY","Takeaway","سفري"],["CAFE","DELIVERY","Delivery","توصيل"],
 ["LAUNDRY","WASHING","Washing","غسيل"],["LAUNDRY","DRY_CLEAN","Dry Cleaning","تنظيف جاف"],["LAUNDRY","PRESSING","Pressing","كي وضغط"],
 ["SALON","HAIRCUT","Haircut","حلاقة"],["SALON","STYLING","Styling","تصفيف"],["SALON","COLORING","Coloring","صبغة"],
 ["AUTO_SERVICE","OIL_CHANGE","Oil Change","تغيير زيت"],["AUTO_SERVICE","DIAGNOSTICS","Diagnostics","فحص وتشخيص"],["AUTO_SERVICE","REPAIR","Repair","إصلاح"],
 ["HOTEL","ROOM_NIGHT","Room Night","ليلة إقامة"],["BOOKSTORE","PRINTING","Printing","طباعة"],["MOBILE_STORE","ACTIVATION","SIM Activation","تفعيل شريحة"],
 ["SERVICES_GENERAL","CONSULTING","Consulting","استشارة"],["SERVICES_GENERAL","DELIVERY","Delivery","توصيل"]
];

const ENUMS = {
 order_type:[["SALE","Sale","بيع"],["RETURN","Return","مرتجع"],["DINE_IN","Dine-in","داخل المحل"],["TAKEAWAY","Takeaway","سفري"],["DELIVERY","Delivery","توصيل"],["ONLINE","Online","إلكتروني"]],
 return_reason:[["CUSTOMER_REQUEST","Customer request","طلب العميل"],["DAMAGED","Damaged","تالف"],["WRONG_ITEM","Wrong item","صنف خاطئ"],["WRONG_QTY","Wrong quantity","كمية خاطئة"],["DEFECTIVE","Defective","عيب/خلل"],["OTHER","Other","أخرى"]],
 discount_type:[["PERCENT","Percentage","نسبة مئوية"],["FIXED","Fixed amount","مبلغ ثابت"],["LINE","Line discount","خصم على السطر"],["ORDER","Order discount","خصم على الفاتورة"],["COUPON","Coupon","قسيمة"],["PROMOTION","Promotion","عرض ترويجي"]],
 inventory_txn_type:[["PURCHASE","Purchase receipt","استلام مشتريات"],["SALE","Sale","بيع"],["RETURN_IN","Sales return","مرتجع مبيعات"],["RETURN_OUT","Purchase return","مرتجع مشتريات"],["TRANSFER_IN","Transfer in","تحويل وارد"],["TRANSFER_OUT","Transfer out","تحويل صادر"],["ADJUSTMENT_IN","Adjustment in","تسوية زيادة"],["ADJUSTMENT_OUT","Adjustment out","تسوية نقص"],["DAMAGE","Damage","تالف"],["EXPIRY","Expiry","منتهي الصلاحية"],["OPENING","Opening balance","رصيد افتتاحي"]],
 customer_type:[["WALK_IN","Walk-in","نقدي/عابر"],["RETAIL","Retail","تجزئة"],["WHOLESALE","Wholesale","جملة"],["CORPORATE","Corporate","شركة"],["GOVERNMENT","Government","جهة حكومية"]],
 supplier_type:[["LOCAL","Local supplier","مورد محلي"],["IMPORTER","Importer","مستورد"],["DISTRIBUTOR","Distributor","موزع"],["MANUFACTURER","Manufacturer","مصنع"],["SERVICE_PROVIDER","Service provider","مقدم خدمة"]],
 cash_movement_type:[["OPENING","Opening cash","رصيد افتتاحي"],["SALE","Cash sale","مبيعات نقدية"],["REFUND","Refund","استرداد"],["PAY_IN","Cash in","إيداع نقدي"],["PAY_OUT","Cash out","سحب نقدي"],["EXPENSE","Expense","مصروف"],["BANK_DEPOSIT","Bank deposit","إيداع بنكي"],["ADJUSTMENT","Adjustment","تسوية"],["CLOSING","Closing cash","إغلاق وردية"]],
 device_type:[["POS_TERMINAL","POS terminal","نقطة بيع"],["PRINTER","Receipt printer","طابعة إيصالات"],["CASH_DRAWER","Cash drawer","درج نقدي"],["SCANNER","Barcode scanner","قارئ باركود"],["SCALE","Scale","ميزان"],["PAYMENT_TERMINAL","Payment terminal","جهاز دفع"]],
 barcode_type:[["EAN13","EAN-13","EAN-13"],["EAN8","EAN-8","EAN-8"],["UPC_A","UPC-A","UPC-A"],["CODE128","Code 128","Code 128"],["CODE39","Code 39","Code 39"],["QR","QR Code","رمز QR"],["GS1_128","GS1-128","GS1-128"],["GS1_DATAMATRIX","GS1 DataMatrix","GS1 DataMatrix"]],
 document_type:[["SALES_INVOICE","Sales invoice","فاتورة مبيعات"],["CREDIT_NOTE","Credit note","إشعار دائن"],["DEBIT_NOTE","Debit note","إشعار مدين"],["RECEIPT","Receipt","إيصال"],["PURCHASE_INVOICE","Purchase invoice","فاتورة مشتريات"]]
};

export function migrateReferenceFoundation(db, _addColumnIfMissing, {version=41,description="comprehensive reference/master data foundation"}={}) {
 db.exec("CREATE TABLE IF NOT EXISTS ref_countries(code_alpha2 TEXT PRIMARY KEY,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS ref_currencies(code TEXT PRIMARY KEY,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',symbol TEXT NOT NULL DEFAULT '',decimals INTEGER NOT NULL DEFAULT 2,is_active INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS business_sectors(code TEXT PRIMARY KEY,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS business_activities(code TEXT PRIMARY KEY,sector_code TEXT NOT NULL REFERENCES business_sectors(code),name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS activity_product_classes(activity_code TEXT NOT NULL REFERENCES business_activities(code),class_code TEXT NOT NULL,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(activity_code,class_code)); CREATE TABLE IF NOT EXISTS activity_services(activity_code TEXT NOT NULL REFERENCES business_activities(code),service_code TEXT NOT NULL,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(activity_code,service_code)); CREATE TABLE IF NOT EXISTS ref_enum_values(enum_name TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 100,is_active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(enum_name,code)); CREATE TABLE IF NOT EXISTS settings_definitions(key TEXT PRIMARY KEY,data_type TEXT NOT NULL,default_value TEXT NOT NULL DEFAULT '',scope TEXT NOT NULL DEFAULT 'ORGANIZATION',category TEXT NOT NULL DEFAULT 'GENERAL',description TEXT NOT NULL DEFAULT '',is_user_editable INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS account_templates(code TEXT PRIMARY KEY,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',activity_code TEXT,is_default INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS account_template_lines(template_code TEXT NOT NULL REFERENCES account_templates(code),account_code TEXT NOT NULL,parent_code TEXT,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',account_type TEXT NOT NULL,normal_balance TEXT NOT NULL,is_control INTEGER NOT NULL DEFAULT 0,sort_order INTEGER NOT NULL DEFAULT 100,PRIMARY KEY(template_code,account_code)); CREATE TABLE IF NOT EXISTS opening_balance_templates(code TEXT PRIMARY KEY,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',activity_code TEXT,description TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS opening_balance_template_lines(template_code TEXT NOT NULL REFERENCES opening_balance_templates(code),account_code TEXT NOT NULL,direction TEXT NOT NULL,default_amount TEXT NOT NULL DEFAULT '0',name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',PRIMARY KEY(template_code,account_code)); CREATE TABLE IF NOT EXISTS onboarding_templates(activity_code TEXT NOT NULL REFERENCES business_activities(code),country_code TEXT NOT NULL DEFAULT '',template_version INTEGER NOT NULL DEFAULT 1,config_json TEXT NOT NULL DEFAULT '{}',is_active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(activity_code,country_code)); CREATE TABLE IF NOT EXISTS price_rule_types(code TEXT PRIMARY KEY,name TEXT NOT NULL,name_ar TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1);");
 // Legacy installations may have a partial onboarding_templates table. Ensure
 // all columns used by v41 exist before indexes and seed inserts run.
 _addColumnIfMissing("onboarding_templates", "activity_code", "TEXT NOT NULL DEFAULT '');
 _addColumnIfMissing("onboarding_templates", "country_code", "TEXT NOT NULL DEFAULT '');
 _addColumnIfMissing("onboarding_templates", "template_version", "INTEGER NOT NULL DEFAULT 1");
 _addColumnIfMissing("onboarding_templates", "config_json", "TEXT NOT NULL DEFAULT '{}');
 _addColumnIfMissing("onboarding_templates", "is_active", "INTEGER NOT NULL DEFAULT 1");
 const ci=db.prepare("INSERT OR IGNORE INTO ref_countries(code_alpha2,name,name_ar) VALUES(?,?,?)");
 for(const code of COUNTRY_CODES){try{const en=new Intl.DisplayNames(["en"],{type:"region"}).of(code)||code;const ar=new Intl.DisplayNames(["ar"],{type:"region"}).of(code)||en;ci.run(code,en,ar)}catch{}}
 const cu=db.prepare("INSERT OR IGNORE INTO ref_currencies(code,name,name_ar,symbol,decimals) VALUES(?,?,?,?,?)");
 for(const code of Intl.supportedValuesOf("currency")){try{const en=new Intl.DisplayNames(["en"],{type:"currency"}).of(code)||code;const ar=new Intl.DisplayNames(["ar"],{type:"currency"}).of(code)||en;const nf=new Intl.NumberFormat("en",{style:"currency",currency:code});const symbol=nf.formatToParts(0).find(p=>p.type==="currency")?.value||code;cu.run(code,en,ar,symbol,nf.resolvedOptions().maximumFractionDigits)}catch{}}
 db.exec("INSERT OR IGNORE INTO ref_currencies(code,name,name_ar,symbol,decimals,is_active) SELECT code,name,name_ar,symbol,decimals,is_active FROM currencies");
 const sectors={RETAIL:["Retail","تجزئة"],HEALTH:["Health","صحة"],FOOD:["Food & Beverage","أغذية ومشروبات"],WHOLESALE:["Wholesale & Distribution","جملة وتوزيع"],TRADES:["Trades & Building","تجارة ومواد بناء"],AUTOMOTIVE:["Automotive","سيارات"],SERVICES:["Services","خدمات"],BEAUTY:["Beauty & Personal Care","تجميل وعناية"],HOSPITALITY:["Hospitality","ضيافة"],ENERGY:["Energy","طاقة"]};
 const si=db.prepare("INSERT OR IGNORE INTO business_sectors(code,name,name_ar) VALUES(?,?,?)");for(const [c,n] of Object.entries(sectors))si.run(c,n[0],n[1]);
 const ai=db.prepare("INSERT OR IGNORE INTO business_activities(code,sector_code,name,name_ar) VALUES(?,?,?,?)");for(const a of ACTIVITIES)ai.run(...a);
 const cl=db.prepare("INSERT OR IGNORE INTO activity_product_classes(activity_code,class_code,name,name_ar) VALUES(?,?,?,?)");for(const r of CLASSES)cl.run(...r);
 const sv=db.prepare("INSERT OR IGNORE INTO activity_services(activity_code,service_code,name,name_ar) VALUES(?,?,?,?)");for(const r of SERVICES)sv.run(...r);
 const ei=db.prepare("INSERT OR IGNORE INTO ref_enum_values(enum_name,code,name,name_ar,sort_order) VALUES(?,?,?,?,?)");for(const [en,rows] of Object.entries(ENUMS))rows.forEach((r,i)=>{ei.run(en,r[0],r[1],r[2],(i+1)*10)});
 const set=db.prepare("INSERT OR IGNORE INTO settings_definitions(key,data_type,default_value,scope,category,description) VALUES(?,?,?,?,?,?)");
 [["currency","string","SAR","ORGANIZATION","FINANCE","Base transaction currency"],["country_code","string","YE","ORGANIZATION","LOCALIZATION","Operating country"],["language","string","ar","USER","LOCALIZATION","Primary UI language"],["timezone","string","Asia/Aden","ORGANIZATION","LOCALIZATION","IANA time zone"],["tax_enabled","boolean","true","ORGANIZATION","TAX","Enable taxes"],["tax_inclusive","boolean","false","ORGANIZATION","TAX","Entered prices include tax"],["decimal_scale","integer","2","ORGANIZATION","FINANCE","Display decimal scale"],["inventory_enabled","boolean","true","ORGANIZATION","INVENTORY","Track stock"],["negative_stock_allowed","boolean","false","ORGANIZATION","INVENTORY","Allow negative stock"],["invoice_prefix","string","INV","BRANCH","DOCUMENTS","Invoice prefix"],["receipt_print_copies","integer","1","POS","PRINTING","Receipt copies"],["barcode_type","string","EAN13","ORGANIZATION","CATALOG","Preferred barcode"],["shift_required","boolean","true","POS","CASH","Require open shift"],["rounding_mode","string","HALF_UP","ORGANIZATION","FINANCE","Money rounding"],["offline_sync_mode","string","off","ORGANIZATION","SYNC","Sync mode; off by default"]].forEach(r=>{set.run(...r)});
 const pr=db.prepare("INSERT OR IGNORE INTO price_rule_types(code,name,name_ar) VALUES(?,?,?)");[["STANDARD","Standard","سعر قياسي"],["CUSTOMER_GROUP","Customer group","مجموعة عملاء"],["QUANTITY","Quantity break","سعر كمية"],["TIME","Time based","سعر حسب الوقت"],["PROMOTION","Promotion","عرض ترويجي"]].forEach(r=>{pr.run(...r)});
 const at=db.prepare("INSERT OR IGNORE INTO account_templates(code,name,name_ar,activity_code,is_default) VALUES(?,?,?,?,?)");[["POS_STANDARD","Standard POS","دليل حسابات نقاط بيع قياسي","",1],["POS_RETAIL","Retail POS","نقاط بيع التجزئة","RETAIL_GENERAL",0],["POS_RESTAURANT","Restaurant POS","نقاط بيع المطاعم","RESTAURANT",0]].forEach(r=>{at.run(...r)});
 const accounts=[["1000",null,"Cash & Bank","النقد والبنوك","ASSET","DEBIT",1],["1100","1000","Cash Drawer","الصندوق","ASSET","DEBIT",0],["1200","1000","Bank Accounts","البنوك","ASSET","DEBIT",0],["1300",null,"Accounts Receivable","العملاء","ASSET","DEBIT",1],["1400",null,"Inventory","المخزون","ASSET","DEBIT",1],["2000",null,"Accounts Payable","الموردون","LIABILITY","CREDIT",1],["2100",null,"Tax Payable","ضريبة مستحقة","LIABILITY","CREDIT",1],["3000",null,"Owner Equity","حقوق الملكية","EQUITY","CREDIT",1],["4000",null,"Sales Revenue","إيرادات المبيعات","REVENUE","CREDIT",1],["4100",null,"Service Revenue","إيرادات الخدمات","REVENUE","CREDIT",1],["5000",null,"Cost of Goods Sold","تكلفة المبيعات","EXPENSE","DEBIT",1],["6000",null,"Operating Expenses","المصروفات التشغيلية","EXPENSE","DEBIT",1]];
 const al=db.prepare("INSERT OR IGNORE INTO account_template_lines(template_code,account_code,parent_code,name,name_ar,account_type,normal_balance,is_control,sort_order) VALUES(?,?,?,?,?,?,?,?,?)");for(const a of accounts)al.run("POS_STANDARD",...a);for(const a of accounts.filter(a=>["4000","4100","5000"].includes(a[0]))){al.run("POS_RETAIL",...a);al.run("POS_RESTAURANT",...a)}
 const ob=db.prepare("INSERT OR IGNORE INTO opening_balance_templates(code,name,name_ar,activity_code,description) VALUES(?,?,?,?,?)");[["POS_STANDARD_OPENING","Standard POS Opening","رصيد افتتاحي قياسي لنقاط البيع",""],["POS_RETAIL_OPENING","Retail Opening","رصيد افتتاحي للتجزئة","RETAIL_GENERAL"],["POS_RESTAURANT_OPENING","Restaurant Opening","رصيد افتتاحي للمطاعم","RESTAURANT"]].forEach(r=>{ob.run(...r,"Opening balance template")});
 const obl=db.prepare("INSERT OR IGNORE INTO opening_balance_template_lines(template_code,account_code,direction,default_amount,name,name_ar) VALUES(?,?,?,?,?,?)");for(const a of accounts.filter(a=>["1100","1200","1300","1400","2000","3000"].includes(a[0])))obl.run("POS_STANDARD_OPENING",a[0],a[5],"0",a[2],a[3]);
 const ot=db.prepare("INSERT OR IGNORE INTO onboarding_templates(activity_code,country_code,config_json) VALUES(?,?,?)");for(const a of ACTIVITIES)ot.run(a[0],"",JSON.stringify({activityCode:a[0],productClasses:true,services:true,units:true,paymentMethods:true,accountTemplate:"POS_STANDARD",openingBalanceTemplate:"POS_STANDARD_OPENING",countryTaxConfigurationRequired:true}));
 db.prepare("INSERT OR REPLACE INTO schema_version(version,description) VALUES(?,?)").run(version,description);
}
export default migrateReferenceFoundation;
