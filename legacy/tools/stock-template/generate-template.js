/**
 * DyPOS Stock Import/Export Excel Template Generator
 * 
 * Creates a standardized Excel template with:
 * - Import template sheet with validation
 * - Export template sheet with all available columns
 * - Sample data sheet with real-world examples
 * - Warehouse reference sheet
 * - Product reference sheet
 * - Validation rules and documentation sheet
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function generateStockTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DyPOS';
  workbook.created = new Date();
  workbook.lastModifiedBy = 'DyPOS System';
  workbook.modified = new Date();

  // ==========================================
  // SHEET 1: Import Template (Main import sheet)
  // ==========================================
  const importSheet = workbook.addWorksheet('Import Template', {
    properties: { tabColor: { argb: 'FF4472C4' } },
    views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }]
  });

  // Import columns with validation - Clear Arabic headers for end users
  // Comprehensive fields covering: basic info, pricing, inventory, compliance, logistics
  const importColumns = [
    // Basic Identification (Required)
    { header: 'كود الصنف*', key: 'product_code', width: 18, comment: 'كود الصنف (مطلوب) - يجب أن يطابق كود منتج موجود في النظام' },
    { header: 'الباركود', key: 'barcode', width: 18, comment: 'الباركود/GTIN/EAN/UPC للمسح الضوئي' },
    { header: 'كود المستودع*', key: 'warehouse_id', width: 15, comment: 'كود المستودع (مطلوب) - مثال: W-01, WH-MAIN, WH-001' },
    { header: 'موقع التخزين', key: 'bin_location', width: 18, comment: 'موقع التخزين/الرف/الصندوق (اختياري) - مثال: A-01-03' },
    
    // Quantity & UoM (Required)
    { header: 'الكمية*', key: 'qty', width: 12, comment: 'الكمية (مطلوب) - رقم موجب للزيادة، سالب للنقصان' },
    { header: 'وحدة القياس*', key: 'uom', width: 15, comment: 'وحدة القياس (مطلوب) - مثال: PCS, BOX, KG, CTN, KG, M, L' },
    { header: 'العملة*', key: 'currency', width: 12, comment: 'العملة (مطلوب) - مثال: SAR, USD, EUR' },
    
    // Pricing & Valuation
    { header: 'سعر البيع', key: 'unit_price', width: 14, comment: 'سعر البيع للوحدة (اختياري) - شاملة الضريبة أو لا' },
    { header: 'تكلفة الوحدة', key: 'unit_cost', width: 12, comment: 'تكلفة الوحدة (اختياري) - قيمة تكلفة الوحدة عند الاستلام/الشراء' },
    { header: 'السعر قبل الضريبة', key: 'price_before_tax', width: 14, comment: 'السعر قبل الضريبة (اختياري) - للاستيراد مع حسابات ضريبية' },
    { header: 'مبلغ الضريبة', key: 'tax_amount', width: 12, comment: 'مبلغ الضريبة للوحدة (اختياري)' },
    { header: 'كود الضريبة', key: 'tax_code', width: 14, comment: 'كود الضريبة (اختياري) - مثال: VAT15, ZAKAT, EXCISE, ZERO, EXEMPT' },
    { header: 'فئة الضريبة', key: 'tax_category', width: 14, comment: 'فئة الضريبة (اختياري) - مثال: STANDARD, ZERO, EXEMPT, EXCISE' },
    { header: 'الضريبة مشمولة', key: 'tax_included', width: 12, comment: 'السعر يشمل الضريبة؟ (اختياري) - true/false' },
    
    // Inventory Tracking
    { header: 'رقم التشغيلة/الدفعة', key: 'batch_number', width: 18, comment: 'رقم الدفعة/التشغيلة (اختياري) - للتتبع' },
    { header: 'رقم السيريال', key: 'serial_number', width: 18, comment: 'رقم السيريال (اختياري) - للمنتجات المسلسلة' },
    { header: 'تاريخ الإنتاج', key: 'production_date', width: 15, comment: 'تاريخ الإنتاج/التصنيع (اختياري) - تنسيق: YYYY-MM-DD' },
    { header: 'تاريخ الانتهاء', key: 'expiry_date', width: 15, comment: 'تاريخ الانتهاء (اختياري) - تنسيق: YYYY-MM-DD' },
    { header: 'تاريخ الاستلام', key: 'received_date', width: 15, comment: 'تاريخ استلام المخزون (اختياري) - تنسيق: YYYY-MM-DD' },
    
    // Product Variants
    { header: 'اللون', key: 'color', width: 12, comment: 'اللون (اختياري) - للمنتجات ذات المتغيرات' },
    { header: 'المقاس/الحجم', key: 'size', width: 12, comment: 'المقاس/الحجم (اختياري) - مثال: S, M, L, XL, 42, 32' },
    { header: 'اللون/المقاس', key: 'variant_code', width: 14, comment: 'كود المتغير (اختياري) - كود متغير المنتج المركب' },
    
    // Supplier & Origin
    { header: 'كود المورد', key: 'supplier_code', width: 14, comment: 'كود المورد (اختياري) - من بيانات الموردين' },
    { header: 'اسم المورد', key: 'supplier_name', width: 20, comment: 'اسم المورد (اختياري)' },
    { header: 'بلد المنشأ', key: 'country_of_origin', width: 15, comment: 'بلد المنشأ (اختياري) - مثال: SA, CN, DE, US, CN' },
    
    // Physical Properties
    { header: 'الوزن (كجم)', key: 'weight_kg', width: 12, comment: 'الوزن بالكيلوغرام (اختياري) - للشحن والتخزين' },
    { header: 'الأبعاد (سم)', key: 'dimensions_cm', width: 18, comment: 'الأبعاد L×W×H بالسنتيمتر (اختياري) - مثال: 50x30x20' },
    { header: 'الحجم (م³)', key: 'volume_m3', width: 12, comment: 'الحجم بالمتر المكعب (اختياري) - للتخزين والشحن' },
    
    // Inventory Policy
    { header: 'حد إعادة الطلب', key: 'reorder_point', width: 12, comment: 'حد إعادة الطلب (اختياري) - الكمية التي عند الوصول لها يتم طلب توريد' },
    { header: 'الحد الأدنى', key: 'min_stock', width: 12, comment: 'الحد الأدنى للمخزون (اختياري)' },
    { header: 'الحد الأقصى', key: 'max_stock', width: 12, comment: 'الحد الأقصى للمخزون (اختياري)' },
    { header: 'حد الطلب الأدنى', key: 'min_order_qty', width: 14, comment: 'حد الطلب الأدنى (اختياري) - أقل كمية للطلب من المورد' },
    { header: 'مدة التوريد (أيام)', key: 'lead_time_days', width: 14, comment: 'مدة التوريد بالأيام (اختياري) - لحساب نقطة إعادة الطلب' },
    
    // Status & Compliance
    { header: 'حالة الصنف', key: 'product_status', width: 14, comment: 'حالة الصنف (اختياري) - ACTIVE/INACTIVE/DISCONTINUED/SEASONAL' },
    { header: 'طريقة التقييم', key: 'valuation_method', width: 14, comment: 'طريقة التقييم (اختياري) - FIFO/LIFO/WEIGHTED_AVERAGE/STANDARD/SPECIFIC_ID' },
    { header: 'طريقة التكلفة', key: 'cost_method', width: 14, comment: 'طريقة التكلفة (اختياري) - STANDARD/ACTUAL/FIFO/LIFO/WEIGHTED_AVERAGE' },
    { header: 'حساب المخزون', key: 'inventory_account', width: 16, comment: 'حساب المخزون المحاسبي (اختياري) - كود الحساب في دليل الحسابات' },
    { header: 'حساب تكلفة البضاعة', key: 'cogs_account', width: 16, comment: 'حساب تكلفة البضاعة المباعة (اختياري)' },
    
    // Logistics & Shipping
    { header: 'رمز النظام المنسق', key: 'hs_code', width: 14, comment: 'رمز النظام المنسق/HS Code (اختياري) - للجمارك والتصدير' },
    { header: 'رمز SLI', key: 'sli_code', width: 12, comment: 'رمز SLI/GTIN (اختياري) - معرّف تجارة عالمي' },
    { header: 'بلد المنشأ', key: 'country_of_origin', width: 15, comment: 'بلد المنشأ (اختياري) - رمز الدولة ISO' },
    { header: 'شروط التسليم', key: 'incoterms', width: 14, comment: 'شروط التسليم/Incoterms (اختياري) - مثال: FOB, CIF, EXW, DDP' },
    { header: 'شروط الدفع', key: 'payment_terms', width: 14, comment: 'شروط الدفع (اختياري) - مثال: NET30, NET60, COD, LC' },
    
    // Transaction Details
    { header: 'السبب', key: 'reason', width: 22, comment: 'سبب الحركة (اختياري) - رصيد افتتاحي، تجديد مخزون، تلف، نقل، إرجاع، تعديل' },
    { header: 'المرجع', key: 'reference', width: 18, comment: 'مرجع خارجي (اختياري) - فاتورة، أمر شراء، سند مخزني، أمر نقل' },
    { header: 'رقم الدفعة/التشغيلة', key: 'batch_number', width: 18, comment: 'رقم الدفعة/التشغيلة (اختياري) - للتتبع والتتبع العكسي' },
    { header: 'رقم السيريال', key: 'serial_number', width: 18, comment: 'رقم السيريال (اختياري) - للمنتجات المسلسلة/المعرفة بشكل فريد' },
    { header: 'تاريخ الإنتاج', key: 'production_date', width: 15, comment: 'تاريخ الإنتاج/التصنيع (اختياري) - تنسيق: YYYY-MM-DD' },
    { header: 'تاريخ الانتهاء', key: 'expiry_date', width: 15, comment: 'تاريخ الانتهاء (اختياري) - تنسيق: YYYY-MM-DD' },
    { header: 'تاريخ الاستلام', key: 'received_date', width: 15, comment: 'تاريخ استلام المخزون (اختياري) - تنسيق: YYYY-MM-DD' },
    { header: 'السبب', key: 'reason', width: 22, comment: 'سبب الحركة (اختياري) - رصيد افتتاحي، تجديد مخزون، تلف، نقل، إرجاع، تعديل، جرد' },
    { header: 'المرجع', key: 'reference', width: 18, comment: 'مرجع خارجي (اختياري) - رقم فاتورة، أمر شراء، سند مخزني، أمر نقل، أمر إنتاج' },
    { header: 'ملاحظات', key: 'notes', width: 30, comment: 'ملاحظات إضافية (اختياري)' }
  ];

  importSheet.columns = importColumns;

  // Style header row
  importSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });

  // Sample data rows (5 examples)
  const sampleRows = [
    { product_code: 'PROD-001', warehouse_id: 'W-01', qty: 100, reason: 'Opening Balance', reference: 'OB-2024-001', unit_cost: 25.50, expiry_date: '', batch_number: '', notes: 'الرصيد الافتتاحي للفرع الرئيسي' },
    { product_code: 'PROD-002', warehouse_id: 'W-01', qty: 50, reason: 'Opening Balance', reference: 'OB-2024-002', unit_cost: 15.75, expiry_date: '2025-12-31', batch_number: 'BATCH-2024-001', notes: 'منتجات غذائية بتاريخ انتهاء' },
    { product_code: 'PROD-003', warehouse_id: 'W-02', qty: 75, reason: 'Opening Balance', reference: 'OB-2024-003', unit_cost: 120.00, expiry_date: '', batch_number: '', notes: 'مستودع الفرع الثاني' },
    { product_code: 'PROD-001', warehouse_id: 'W-02', qty: 25, reason: 'Transfer In', reference: 'TRF-2024-001', unit_cost: 25.50, expiry_date: '', batch_number: '', notes: 'نقل من المستودع الرئيسي' },
    { product_code: 'PROD-004', warehouse_id: 'W-01', qty: -5, reason: 'Damage', reference: 'DMG-2024-001', unit_cost: 0, expiry_date: '', batch_number: '', notes: 'تلف أثناء النقل' },
  ];

  sampleRows.forEach((row, index) => {
    const rowObj = importSheet.addRow(row);
    rowObj.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (colNumber === 3) cell.numFmt = '#,##0.00'; // qty
      if (colNumber === 6) cell.numFmt = '#,##0.000'; // unit_cost
    });
    // Color code: green for positive, red for negative
    const qtyCell = rowObj.getCell('qty');
    if (qtyCell.value < 0) {
      qtyCell.font = { color: { argb: 'FFFF0000' }, bold: true };
    } else if (qtyCell.value > 0) {
      qtyCell.font = { color: { argb: 'FF006100' }, bold: true };
    }
  });

  // Add 500 empty rows with formatting
  for (let i = 0; i < 500; i++) {
    const row = importSheet.addRow({});
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  }

  // ==========================================
  // SHEET 2: Export Template (Full export with all columns)
  // ==========================================
  const exportSheet = workbook.addWorksheet('Export Template', {
    properties: { tabColor: { argb: 'FF548235' } },
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const exportColumns = [
    // Basic Identification
    { header: 'معرف المنتج', key: 'product_id', width: 14, comment: 'معرف المنتج (المفتاح الأساسي)' },
    { header: 'كود المنتج', key: 'product_code', width: 16, comment: 'كود المنتج' },
    { header: 'الباركود', key: 'barcode', width: 18, comment: 'الباركود/GTIN/EAN/UPC' },
    { header: 'اسم المنتج', key: 'product_name', width: 28, comment: 'اسم المنتج' },
    { header: 'اسم المنتج بالعربي', key: 'product_name_ar', width: 28, comment: 'اسم المنتج بالعربية' },
    { header: 'الباركود', key: 'barcode', width: 18, comment: 'الباركود/GTIN/EAN/UPC' },
    { header: 'التصنيف', key: 'category', width: 18, comment: 'التصنيف' },
    { header: 'العلامة التجارية', key: 'brand', width: 18, comment: 'العلامة التجارية' },
    { header: 'كود المستودع', key: 'warehouse_id', width: 14, comment: 'كود المستودع' },
    { header: 'اسم المستودع', key: 'warehouse_name', width: 18, comment: 'اسم المستودع' },
    { header: 'موقع التخزين', key: 'bin_location', width: 16, comment: 'موقع التخزين/الرف' },
    
    // Quantity & UoM
    { header: 'الكمية', key: 'qty', width: 11, comment: 'الكمية المتاحة' },
    { header: 'الكمية المحجوزة', key: 'reserved_qty', width: 12, comment: 'الكمية المحجوزة' },
    { header: 'الكمية المتاحة', key: 'available_qty', width: 12, comment: 'الكمية المتاحة للبيع (الكمية - المحجوز)' },
    { header: 'الكمية المخصصة', key: 'allocated_qty', width: 12, comment: 'الكمية المخصصة' },
    { header: 'وحدة القياس', key: 'uom', width: 11, comment: 'وحدة القياس' },
    { header: 'العملة', key: 'currency', width: 10, comment: 'العملة' },
    
    // Pricing & Valuation
    { header: 'سعر البيع', key: 'unit_price', width: 11, comment: 'سعر البيع' },
    { header: 'تكلفة الوحدة', key: 'unit_cost', width: 11, comment: 'تكلفة الوحدة' },
    { header: 'السعر قبل الضريبة', key: 'price_before_tax', width: 12, comment: 'السعر قبل الضريبة' },
    { header: 'مبلغ الضريبة', key: 'tax_amount', width: 11, comment: 'مبلغ الضريبة للوحدة' },
    { header: 'كود الضريبة', key: 'tax_code', width: 12, comment: 'كود الضريبة: VAT15, ZAKAT, EXCISE, ZERO, EXEMPT' },
    { header: 'فئة الضريبة', key: 'tax_category', width: 12, comment: 'فئة الضريبة: STANDARD, ZERO, EXEMPT, EXCISE' },
    { header: 'الضريبة مشمولة', key: 'tax_included', width: 10, comment: 'السعر يشمل الضريبة: true/false' },
    { header: 'قيمة المخزون', key: 'stock_value', width: 12, comment: 'قيمة المخزون (الكمية × تكلفة الوحدة)' },
    
    // Inventory Policy
    { header: 'حد إعادة الطلب', key: 'reorder_point', width: 11, comment: 'حد إعادة الطلب' },
    { header: 'الحد الأقصى للمخزون', key: 'max_stock', width: 11, comment: 'الحد الأقصى للمخزون' },
    { header: 'الحد الأدنى', key: 'min_stock', width: 10, comment: 'الحد الأدنى للمخزون' },
    { header: 'حد الطلب الأدنى', key: 'min_order_qty', width: 11, comment: 'حد الطلب الأدنى' },
    { header: 'مدة التوريد (أيام)', key: 'lead_time_days', width: 11, comment: 'مدة التوريد بالأيام' },
    
    // Dates & Tracking
    { header: 'تاريخ الانتهاء', key: 'expiry_date', width: 13, comment: 'تاريخ الانتهاء' },
    { header: 'تاريخ الإنتاج', key: 'production_date', width: 12, comment: 'تاريخ الإنتاج' },
    { header: 'تاريخ الاستلام', key: 'received_date', width: 12, comment: 'تاريخ الاستلام' },
    { header: 'رقم الدفعة', key: 'batch_number', width: 16, comment: 'رقم الدفعة/التشغيلة' },
    { header: 'رقم السيريال', key: 'serial_number', width: 14, comment: 'رقم السيريال' },
    
    // Variants
    { header: 'اللون', key: 'color', width: 10, comment: 'اللون' },
    { header: 'المقاس/الحجم', key: 'size', width: 10, comment: 'المقاس/الحجم' },
    { header: 'كود المتغير', key: 'variant_code', width: 12, comment: 'كود المتغير' },
    
    // Supplier & Origin
    { header: 'كود المورد', key: 'supplier_code', width: 12, comment: 'كود المورد' },
    { header: 'اسم المورد', key: 'supplier_name', width: 18, comment: 'اسم المورد' },
    { header: 'بلد المنشأ', key: 'country_of_origin', width: 13, comment: 'بلد المنشأ' },
    
    // Physical
    { header: 'الوزن (كجم)', key: 'weight_kg', width: 10, comment: 'الوزن بالكيلوغرام' },
    { header: 'الأبعاد (سم)', key: 'dimensions_cm', width: 14, comment: 'الأبعاد L×W×H بالسنتيمتر' },
    { header: 'الحجم (م³)', key: 'volume_m3', width: 10, comment: 'الحجم بالمتر المكعب' },
    
    // Compliance
    { header: 'حالة الصنف', key: 'product_status', width: 11, comment: 'حالة الصنف: ACTIVE/INACTIVE/DISCONTINUED/SEASONAL' },
    { header: 'طريقة التقييم', key: 'valuation_method', width: 12, comment: 'طريقة التقييم: FIFO/LIFO/WEIGHTED_AVERAGE/STANDARD' },
    { header: 'طريقة التكلفة', key: 'cost_method', width: 11, comment: 'طريقة التكلفة: STANDARD/ACTUAL/FIFO/LIFO/WA' },
    { header: 'حساب المخزون', key: 'inventory_account', width: 13, comment: 'حساب المخزون المحاسبي' },
    { header: 'حساب تكلفة البضاعة', key: 'cogs_account', width: 13, comment: 'حساب تكلفة البضاعة المباعة' },
    { header: 'رمز النظام المنسق', key: 'hs_code', width: 11, comment: 'رمز النظام المنسق/HS Code' },
    { header: 'رمز SLI', key: 'sli_code', width: 9, comment: 'رمز SLI/GTIN' },
    { header: 'بلد المنشأ', key: 'country_of_origin', width: 11, comment: 'بلد المنشأ (ISO)' },
    { header: 'شروط التسليم', key: 'incoterms', width: 11, comment: 'شروط التسليم: FOB/CIF/EXW/DDP' },
    { header: 'شروط الدفع', key: 'payment_terms', width: 11, comment: 'شروط الدفع: NET30/NET60/COD/LC' },
    
    // Transaction
    { header: 'تاريخ الانتهاء', key: 'expiry_date', width: 13, comment: 'تاريخ الانتهاء' },
    { header: 'تاريخ الإنتاج', key: 'production_date', width: 12, comment: 'تاريخ الإنتاج' },
    { header: 'تاريخ الاستلام', key: 'received_date', width: 12, comment: 'تاريخ الاستلام' },
    { header: 'رقم الدفعة', key: 'batch_number', width: 16, comment: 'رقم الدفعة/التشغيلة' },
    { header: 'رقم السيريال', key: 'serial_number', width: 14, comment: 'رقم السيريال' },
    { header: 'تاريخ التحديث', key: 'updated_at', width: 18, comment: 'تاريخ آخر تحديث' },
    { header: 'الحالة', key: 'status', width: 13, comment: 'حالة المخزون: عادي/منخفض/نفذ/زائد' }
  ];

  exportSheet.columns = exportColumns;

  // Style export header
  exportSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF548235' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  // Sample export data with formulas
  const exportSampleData = [
    { product_id: 1, product_code: 'PROD-001', product_name: 'Laptop Dell XPS 13', product_name_ar: 'لابتوب ديل إكس بي إس 13', barcode: '8806089123456', category: 'Electronics', brand: 'Dell', warehouse_id: 'W-01', warehouse_name: 'المستودع الرئيسي', qty: 150, reserved_qty: 10, available_qty: 140, allocated_qty: 5, uom: 'PCS', currency: 'SAR', unit_price: 4500.00, unit_cost: 3200.00, stock_value: 480000, reorder_point: 10, max_stock: 500, expiry_date: '', batch_number: '', updated_at: '2024-12-15 10:30:00', status: 'normal' },
    { product_id: 2, product_code: 'PROD-002', product_name: 'Wireless Mouse Logitech', product_name_ar: 'ماوس لاسلكي لوجيتيك', barcode: '8806089123457', category: 'Electronics', brand: 'Logitech', warehouse_id: 'W-01', warehouse_name: 'المستودع الرئيسي', qty: 200, reserved_qty: 15, available_qty: 185, allocated_qty: 8, uom: 'PCS', currency: 'SAR', unit_price: 150.00, unit_cost: 85.00, stock_value: 17000, reorder_point: 20, max_stock: 1000, expiry_date: '', batch_number: '', updated_at: '2024-12-14 09:15:00', status: 'normal' },
    { product_id: 3, product_code: 'PROD-003', product_name: 'Office Chair Ergonomic', product_name_ar: 'كرسي مكتبي مريح', barcode: '8806089123458', category: 'Furniture', brand: 'Herman Miller', warehouse_id: 'W-02', warehouse_name: 'مستودع الفرع', qty: 5, reserved_qty: 2, available_qty: 3, allocated_qty: 0, uom: 'PCS', currency: 'SAR', unit_price: 1200.00, unit_cost: 750.00, stock_value: 3750, reorder_point: 5, max_stock: 50, expiry_date: '', batch_number: '', updated_at: '2024-12-13 14:20:00', status: 'low' },
    { product_id: 4, product_code: 'PROD-004', product_name: 'A4 Paper Box (5 Reams)', product_name_ar: 'صندوق ورق A4 (5 رزم)', barcode: '8806089123459', category: 'Office Supplies', brand: 'Double A', warehouse_id: 'W-01', warehouse_name: 'المستودع الرئيسي', qty: 0, reserved_qty: 0, available_qty: 0, allocated_qty: 0, uom: 'CTN', currency: 'SAR', unit_price: 45.00, unit_cost: 28.00, stock_value: 0, reorder_point: 10, max_stock: 200, expiry_date: '', batch_number: '', updated_at: '2024-12-10 11:00:00', status: 'out' },
  ];

  exportSampleData.forEach((row) => {
    const rowObj = exportSheet.addRow(row);
    rowObj.eachCell((cell, colNumber) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      // Format numbers
      if (['qty', 'reserved_qty', 'available_qty', 'allocated_qty', 'reorder_point', 'max_stock', 'min_stock', 'min_order_qty', 'lead_time_days'].includes(cell.col.key)) {
        cell.numFmt = '#,##0';
      }
      if (['unit_price', 'unit_cost', 'stock_value', 'price_before_tax', 'tax_amount', 'weight_kg', 'volume_m3'].includes(cell.col.key)) {
        cell.numFmt = '#,##0.00';
      }
    });
  });

  // ==========================================
  // SHEET 3: Sample Data (Real-world examples)
  // ==========================================
  const sampleSheet = workbook.addWorksheet('Sample Data', {
    properties: { tabColor: { argb: 'FFED7D31' } },
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  // Add multiple tables on one sheet with titles
  // Table 1: Products
  sampleSheet.addRow(['PRODUCTS MASTER DATA']).font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
  sampleSheet.mergeCells('A1:J1');
  sampleSheet.getRow(1).alignment = { horizontal: 'center' };

  const productHeaders = ['المعرف', 'الكود', 'الاسم (EN)', 'الاسم (عربي)', 'الباركود', 'التصنيف', 'العلامة التجارية', 'سعر البيع', 'التكلفة', 'الضريبة %', 'وحدة القياس', 'التصنيف', 'العلامة التجارية', 'حد إعادة الطلب', 'الحد الأقصى', 'نشط'];
  const productHeaderRow = sampleSheet.addRow(productHeaders);
  productHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });

  const products = [
    [1, 'PROD-001', 'Laptop Dell XPS 13', 'لابتوب ديل إكس بي إس 13', '8806089123456', 'Electronics', 'Dell', 4500.00, 3200.00, 15, 'Unit', 'Electronics', 'Dell', 10, 500, true],
    [2, 'PROD-002', 'Wireless Mouse Logitech', 'ماوس لاسلكي لوجيتيك', '8806089123457', 'Electronics', 'Logitech', 150.00, 85.00, 15, 'Unit', 'Electronics', 'Logitech', 20, 1000, true],
    [3, 'PROD-003', 'Office Chair Ergonomic', 'كرسي مكتبي مريح', '8806089123458', 'Furniture', 'Herman Miller', 1200.00, 750.00, 15, 'Unit', 'Furniture', 'Herman Miller', 5, 50, true],
    [4, 'PROD-004', 'A4 Paper Box (5 Reams)', 'صندوق ورق A4 (5 رزم)', '8806089123459', 'Office Supplies', 'Double A', 45.00, 28.00, 15, 'Box', 'Office Supplies', 'Double A', 10, 200, true],
    [5, 'PROD-005', 'Monitor Samsung 27"', 'شاشة سامسونج 27 بوصة', '8806089123460', 'Electronics', 'Samsung', 1800.00, 1100.00, 15, 'Unit', 'Electronics', 'Samsung', 5, 100, true],
    [6, 'PROD-006', 'Keyboard Mechanical RGB', 'لوحة مفاتيح ميكانيكية', '8806089123461', 'Electronics', 'Keychron', 450.00, 280.00, 15, 'Unit', 'Electronics', 'Keychron', 15, 200, true],
    [7, 'PROD-007', 'Desk Lamp LED', 'مصباح مكتب LED', '8806089123462', 'Furniture', 'Xiaomi', 120.00, 65.00, 15, 'Unit', 'Furniture', 'Xiaomi', 10, 150, true],
    [8, 'PROD-008', 'Notebook A5 (Pack of 10)', 'دفتر ملاحظات A5 (10 قطع)', '8806089123463', 'Office Supplies', 'Moleskine', 120.00, 70.00, 15, 'Pack', 'Office Supplies', 'Moleskine', 20, 500, true],
    [9, 'PROD-009', 'External SSD 1TB', 'قرص صلب خارجي 1 تيرابايت', '8806089123464', 'Electronics', 'Samsung', 650.00, 420.00, 15, 'Unit', 'Electronics', 'Samsung', 8, 150, true],
    [10, 'PROD-010', 'Webcam HD 1080p', 'كاميرا ويب عالية الدقة', '8806089123465', 'Electronics', 'Logitech', 350.00, 200.00, 15, 'Unit', 'Electronics', 'Logitech', 10, 100, true],
    [11, 'PROD-011', 'Printer HP LaserJet', 'طابعة إتش بي ليزر جيت', '8806089123466', 'Electronics', 'HP', 2200.00, 1500.00, 15, 'Unit', 'Electronics', 'HP', 3, 50, true],
    [11, 'PROD-012', 'Scanner Document', 'ماسحة مستندات', '8806089123467', 'Electronics', 'Fujitsu', 1800.00, 1200.00, 15, 'Unit', 'Electronics', 'Fujitsu', 2, 30, true],
    [12, 'PROD-013', 'Whiteboard 120x90cm', 'سبورة بيضاء 120x90 سم', '8806089123468', 'Furniture', 'Quartet', 450.00, 280.00, 15, 'Unit', 'Furniture', 'Quartet', 5, 40, true],
    [13, 'PROD-014', 'Projector Epson', 'بروجيكتور إبسون', '8806089123469', 'Electronics', 'Epson', 3500.00, 2400.00, 15, 'Unit', 'Electronics', 'Epson', 2, 20, true],
    [15, 'PROD-015', 'Shredder Cross-Cut', 'آلة تمزيق متقاطعة', '8806089123470', 'Office Supplies', 'Fellowes', 850.00, 550.00, 15, 'Unit', 'Office Supplies', 'Fellowes', 5, 60, true],
  ];

  products.forEach((product, index) => {
    const row = sampleSheet.addRow([index + 1, ...product.slice(1)]);
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (typeof cell.value === 'number' && cell.col > 7 && cell.col < 11) {
        cell.numFmt = '#,##0.00';
      }
    });
  });

  // Table 2: Warehouses (after products)
  const startWarehouseRow = 17 + products.length + 2;
  sampleSheet.addRow([]);
  const warehouseTitleRow = sampleSheet.addRow(['WAREHOUSES MASTER DATA']);
  warehouseTitleRow.font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
  sampleSheet.mergeCells(`A${startWarehouseRow - 1}:G${startWarehouseRow - 1}`);
  warehouseTitleRow.alignment = { horizontal: 'center' };

  const warehouseHeaders = ['المعرف', 'الكود', 'الاسم', 'الاسم (عربي)', 'النوع', 'العنوان', 'المدير', 'الهاتف', 'البريد الإلكتروني', 'نشط'];
  const whHeaderRow = sampleSheet.addRow(warehouseHeaders);
  whHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF548235' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });

  const warehouses = [
    ['W-01', 'WH-MAIN', 'Main Warehouse', 'المستودع الرئيسي', 'Main', 'King Fahd Road, Riyadh', 'Ahmed Al-Rashid', '+966501234567', 'warehouse.main@company.com', true],
    ['W-02', 'WH-BRANCH', 'Branch Warehouse', 'مستودع الفرع', 'Branch', 'Olaya Street, Riyadh', 'Mohammed Al-Saud', '+966502345678', 'warehouse.branch@company.com', true],
    ['W-03', 'WH-COLD', 'Cold Storage', 'مستودع التبريد', 'Cold Storage', 'Industrial Area, Riyadh', 'Khalid Al-Mansour', '+966503456789', 'warehouse.cold@company.com', true],
    ['W-04', 'WH-RETURNS', 'Returns Warehouse', 'مستودع المرتجعات', 'Returns', 'King Fahd Road, Riyadh', 'Sara Al-Otaibi', '+966504567890', 'warehouse.returns@company.com', true],
    ['W-05', 'WH-TRANSIT', 'Transit Warehouse', 'مستودع الترانزيت', 'Transit', 'Airport Road, Riyadh', 'Omar Al-Qarni', '+966505678901', 'warehouse.transit@company.com', true],
  ];

  warehouses.forEach((wh) => {
    const row = sampleSheet.addRow(wh);
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  });

  // Table 3: Stock Levels (Opening Balances)
  const startStockRow = startWarehouseRow + warehouses.length + 3;
  sampleSheet.addRow([]);
  const stockTitleRow = sampleSheet.addRow(['OPENING STOCK BALANCES (الرصيد الافتتاحي للمخزون)']);
  stockTitleRow.font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
  sampleSheet.mergeCells(`A${startStockRow}:L${startStockRow}`);
  stockTitleRow.alignment = { horizontal: 'center' };

  const stockHeaders = ['كود المنتج', 'اسم المنتج', 'المستودع', 'الكمية الافتتاحية', 'محجوز', 'متاح', 'تكلفة الوحدة', 'القيمة الإجمالية', 'حد إعادة الطلب', 'الحالة', 'تاريخ التحديث', 'ملاحظات'];
  const stockHeaderRow = sampleSheet.addRow(stockHeaders);
  stockHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });

  const stockData = [
    ['PROD-001', 'Laptop Dell XPS 13', 'W-01', 150, 10, 140, 3200.00, 480000, 10, 'Normal', '2024-12-15', 'Main warehouse stock'],
    ['PROD-001', 'Laptop Dell XPS 13', 'W-02', 25, 2, 23, 3200.00, 80000, 10, 'Normal', '2024-12-15', 'Branch warehouse'],
    ['PROD-002', 'Wireless Mouse Logitech', 'W-01', 200, 15, 185, 85.00, 17000, 20, 'Normal', '2024-12-14', 'Fast moving item'],
    ['PROD-003', 'Office Chair Ergonomic', 'W-02', 5, 2, 3, 750.00, 3750, 5, 'Low Stock', '2024-12-13', 'Below reorder point'],
    ['PROD-004', 'A4 Paper Box (5 Reams)', 'W-01', 0, 0, 0, 28.00, 0, 10, 'Out of Stock', '2024-12-10', 'Urgent reorder needed'],
    ['PROD-005', 'Monitor Samsung 27"', 'W-01', 30, 5, 25, 1100.00, 33000, 5, 'Normal', '2024-12-12', ''],
    ['PROD-006', 'Keyboard Mechanical RGB', 'W-01', 75, 8, 67, 280.00, 21000, 15, 'Normal', '2024-12-11', ''],
    ['PROD-007', 'Desk Lamp LED', 'W-02', 40, 3, 37, 65.00, 2600, 10, 'Normal', '2024-12-10', ''],
    ['PROD-008', 'Notebook A5 (Pack of 10)', 'W-01', 200, 10, 190, 70.00, 14000, 20, 'Normal', '2024-12-09', 'Bulk pack'],
    ['PROD-009', 'External SSD 1TB', 'W-01', 45, 5, 40, 420.00, 18900, 8, 'Normal', '2024-12-08', ''],
    ['PROD-010', 'Webcam HD 1080p', 'W-01', 60, 8, 52, 200.00, 12000, 10, 'Normal', '2024-12-07', ''],
  ];

  stockData.forEach((stock, index) => {
    const row = sampleSheet.addRow([index + 1, ...stock.slice(1)]);
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (cell.col >= 4 && cell.col <= 8 && typeof cell.value === 'number') {
        if (cell.col === 8) cell.numFmt = '#,##0';
        else cell.numFmt = '#,##0.00';
      }
      // Color code status
      if (cell.col === 10) {
        if (cell.value === 'Out of Stock') cell.font = { color: { argb: 'FFFF0000' }, bold: true };
        else if (cell.value === 'Low Stock') cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
        else if (cell.value === 'Normal') cell.font = { color: { argb: 'FF006100' }, bold: true };
      }
    });
  });

  // ==========================================
  // SHEET 4: Warehouse Reference
  // ==========================================
  const warehouseSheet = workbook.addWorksheet('Warehouse Reference', {
    properties: { tabColor: { argb: 'FF7030A0' } },
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const whRefCols = [
    { header: 'كود المستودع*', key: 'warehouse_id', width: 15 },
    { header: 'الاسم*', key: 'name', width: 25 },
    { header: 'الاسم بالعربي', key: 'name_ar', width: 25 },
    { header: 'النوع', key: 'type', width: 15 },
    { header: 'العنوان', key: 'address', width: 40 },
    { header: 'المدينة', key: 'city', width: 15 },
    { header: 'الدولة', key: 'country', width: 15 },
    { header: 'اسم المدير', key: 'manager_name', width: 20 },
    { header: 'هاتف المدير', key: 'manager_phone', width: 18 },
    { header: 'بريد المدير', key: 'manager_email', width: 25 },
    { header: 'نشط', key: 'is_active', width: 10 },
    { header: 'ملاحظات', key: 'notes', width: 30 }
  ];
  warehouseSheet.columns = whRefCols;

  warehouseSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7030A0' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  warehouses.forEach((wh) => {
    const row = warehouseSheet.addRow({
      warehouse_id: wh[0],
      name: wh[1],
      name_ar: wh[2],
      type: wh[3],
      address: wh[3],
      city: 'Riyadh',
      country: 'Saudi Arabia',
      manager_name: wh[5],
      manager_phone: wh[6],
      manager_email: wh[7],
      is_active: wh[8] ? 'true' : 'false',
      notes: wh[3]
    });
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  });

  // ==========================================
  // SHEET 5: Product Reference
  // ==========================================
  const productSheet = workbook.addWorksheet('Product Reference', {
    properties: { tabColor: { argb: 'FF0070C0' } },
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const prodRefCols = [
    { header: 'كود المنتج*', key: 'product_code', width: 18 },
    { header: 'الاسم*', key: 'name', width: 30 },
    { header: 'الاسم بالعربي', key: 'name_ar', width: 30 },
    { header: 'الباركود', key: 'barcode', width: 18 },
    { header: 'التصنيف', key: 'category', width: 20 },
    { header: 'العلامة التجارية', key: 'brand', width: 20 },
    { header: 'سعر البيع', key: 'unit_price', width: 12 },
    { header: 'تكلفة الوحدة', key: 'unit_cost', width: 12 },
    { header: 'نسبة الضريبة', key: 'tax_rate', width: 10 },
    { header: 'وحدة القياس', key: 'uom', width: 10 },
    { header: 'التصنيف', key: 'category2', width: 20 },
    { header: 'العلامة التجارية', key: 'brand2', width: 20 },
    { header: 'حد إعادة الطلب', key: 'reorder_point', width: 12 },
    { header: 'الحد الأقصى للمخزون', key: 'max_stock', width: 10 },
    { header: 'نشط', key: 'is_active', width: 10 },
    { header: 'الوصف', key: 'description', width: 40 }
  ];
  productSheet.columns = prodRefCols;

  productSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  products.forEach((p) => {
    const row = productSheet.addRow({
      product_code: p[1],
      name: p[2],
      name_ar: p[3],
      barcode: p[4],
      category: p[5],
      brand: p[6],
      unit_price: p[7],
      unit_cost: p[8],
      tax_rate: p[9],
      uom: p[10],
      category2: p[11],
      brand2: p[12],
      reorder_point: p[13],
      max_stock: p[14],
      is_active: p[15] ? 'true' : 'false',
      description: `High quality ${p[5].toLowerCase()} from ${p[6]}`
    });
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (typeof cell.value === 'number' && (cell.col === 7 || cell.col === 8)) {
        cell.numFmt = '#,##0.00';
      }
    });
  });

  // ==========================================
  // SHEET 6: Validation Rules & Documentation
  // ==========================================
  const docsSheet = workbook.addWorksheet('Validation Rules & Guide', {
    properties: { tabColor: { argb: 'FFC00000' } }
  });

  docsSheet.columns = [
    { header: 'Section', key: 'section', width: 25 },
    { header: 'Rule / Field', key: 'field', width: 30 },
    { header: 'Description / Rule', key: 'description', width: 80 },
    { header: 'Required', key: 'required', width: 10 },
    { header: 'Format / Example', key: 'example', width: 35 }
  ];

  docsSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const docRows = [
    ['IMPORT TEMPLATE', 'product_code*', 'Product code must exist in Products master data. Case-sensitive match.', 'Yes', 'PROD-001'],
    ['IMPORT TEMPLATE', 'warehouse_id*', 'Warehouse ID must exist in Warehouses master data.', 'Yes', 'W-01, WH-MAIN'],
    ['IMPORT TEMPLATE', 'qty*', 'Quantity: positive for stock-in, negative for stock-out. Max ±1,000,000.', 'Yes', '100, -5, 1000'],
    ['IMPORT TEMPLATE', 'reason', 'Reason for stock movement. Used for audit trail.', 'No', 'Opening Balance, Restock, Damage, Transfer, Return'],
    ['IMPORT TEMPLATE', 'reference', 'External reference number (PO, Invoice, GRN, etc.)', 'No', 'PO-2024-001, GRN-001'],
    ['IMPORT TEMPLATE', 'unit_cost', 'Cost per unit for valuation. Used for stock valuation.', 'No', '25.50, 1200.00'],
    ['IMPORT TEMPLATE', 'expiry_date', 'Expiry date for perishable items. Format: YYYY-MM-DD.', 'No', '2025-12-31'],
    ['IMPORT TEMPLATE', 'batch_number', 'Batch/Lot number for traceability.', 'No', 'BATCH-2024-001'],
    ['IMPORT TEMPLATE', 'notes', 'Free text notes for additional context.', 'No', 'Initial stock load'],
    ['', '', '', '', ''],
    ['EXPORT TEMPLATE', 'All columns', 'Full export includes all stock dimensions and valuations.', 'N/A', 'All 20 columns'],
    ['EXPORT TEMPLATE', 'format', 'CSV (UTF-8 with BOM) or JSON. CSV for Excel, JSON for API.', 'Yes', 'csv / json'],
    ['EXPORT TEMPLATE', 'fields', 'Select specific columns to reduce payload size.', 'No', 'product_code,warehouse_id,qty'],
    ['EXPORT TEMPLATE', 'format=csv', 'Returns CSV with UTF-8 BOM for Arabic support in Excel.', 'Yes', 'text/csv'],
    ['EXPORT TEMPLATE', 'format=json', 'Returns JSON with metadata (count, exported_at).', 'Yes', 'application/json'],
    ['EXPORT TEMPLATE', 'fields', 'Select specific columns to reduce payload size.', 'No', 'product_code,warehouse_id,qty'],
    ['EXPORT TEMPLATE', 'format=csv', 'Returns CSV with UTF-8 BOM for Arabic support in Excel.', 'Yes', 'text/csv'],
    ['EXPORT TEMPLATE', 'format=json', 'Returns JSON with metadata (count, exported_at).', 'Yes', 'application/json'],
    ['EXPORT TEMPLATE', 'fields', 'Select specific columns to reduce payload size.', 'No', 'product_code,warehouse_id,qty'],
    ['EXPORT TEMPLATE', 'limit/offset', 'Pagination for large datasets. Max 10,000 per request.', 'No', 'limit=5000&offset=0'],
    ['EXPORT TEMPLATE', 'from/to', 'Date range filter on updated_at. Format: YYYY-MM-DD.', 'No', 'from=2024-01-01&to=2024-12-31'],
    ['EXPORT TEMPLATE', 'jobs endpoint', 'Background job for >10k rows. Returns job ID for polling.', 'For >10k', 'POST /api/export/stock/jobs'],
    ['', '', '', '', ''],
    ['VALIDATION RULES', 'product_code', 'Must exist in products table. Case-sensitive exact match on code.', 'Yes', 'PROD-001'],
    ['VALIDATION RULES', 'warehouse_id', 'Must exist in warehouses table. Auto-created if missing.', 'Yes', 'W-01'],
    ['VALIDATION RULES', 'qty', 'Finite number. Range: -1,000,000 to 1,000,000.', 'Yes', '100, -5'],
    ['VALIDATION RULES', 'tenant_scope', 'All operations scoped to caller tenant. Cross-tenant = 403/404.', 'Auto', 'Enforced by API'],
    ['VALIDATION RULES', 'idempotency', 'Use Idempotency-Key header for safe retries on import/export.', 'Recommended', 'Idempotency-Key: uuid-v4'],
    ['', '', '', '', ''],
    ['API ENDPOINTS', 'GET /api/export/stock', 'Direct CSV/JSON export (sync, up to 10k rows).', 'GET', '/api/export/stock?format=csv&limit=5000'],
    ['API ENDPOINTS', 'POST /api/export/stock/jobs', 'Background export job (async, up to 100k rows).', 'POST', '{format: "csv", limit: 50000}'],
    ['API ENDPOINTS', 'GET /api/export/jobs/:id', 'Poll job status. ?download=1 returns file when DONE.', 'GET', '/api/export/jobs/abc123?download=1'],
    ['API ENDPOINTS', 'POST /api/import/stock', 'Import stock levels (JSON array or CSV text).', 'POST', 'Body: [{product_code,warehouse_id,qty,reason}]'],
    ['API ENDPOINTS', 'POST /api/import/stock?dryRun=1', 'Validate only, no writes. Returns validation result.', 'POST', '?dryRun=1'],
    ['API ENDPOINTS', 'GET /api/export/jobs', 'List all export jobs with status.', 'GET', '/api/export/jobs'],
    ['', '', '', '', ''],
    ['STOCK STATUS LOGIC', 'normal', 'qty > reorder_point AND qty > 0', 'Auto', 'Green badge'],
    ['STOCK STATUS LOGIC', 'low', '0 < qty <= reorder_point', 'Auto', 'Orange badge'],
    ['STOCK STATUS LOGIC', 'out', 'qty <= 0', 'Auto', 'Red badge'],
    ['STOCK STATUS LOGIC', 'overstocked', 'qty > max_stock (if max_stock > 0)', 'Auto', 'Blue badge'],
    ['', '', '', '', ''],
    ['CSV FORMAT', 'Encoding', 'UTF-8 with BOM (﻿) for Arabic support in Excel.', 'Required', ''],
    ['CSV FORMAT', 'Delimiter', 'Comma (,). Values with commas/quotes wrapped in double quotes.', 'Required', ''],
    ['CSV FORMAT', 'Line endings', 'CRLF (\\r\\n) for Windows compatibility.', 'Required', ''],
    ['CSV FORMAT', 'Date format', 'YYYY-MM-DD (ISO 8601) for all date fields.', 'Required', '2024-12-31'],
    ['CSV FORMAT', 'Numbers', 'Dot decimal separator. No thousand separators.', 'Required', '1234.56'],
    ['CSV FORMAT', 'Arabic text', 'Supported natively with UTF-8 BOM encoding.', 'Supported', 'منتج تجريبي'],
  ];

  docRows.forEach((row) => {
    const rowObj = docsSheet.addRow(row);
    rowObj.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    // Bold section headers
    if (row[0] && (row[0].endsWith('TEMPLATE') || row[0].endsWith('RULES') || row[0].endsWith('ENDPOINTS') || row[0].endsWith('LOGIC') || row[0].endsWith('FORMAT'))) {
      rowObj.getCell('section').font = { bold: true, color: { argb: 'FFC00000' }, size: 11 };
      rowObj.getCell('section').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
    }
  });

  // Style all sheets consistently
  const allSheets = [importSheet, exportSheet, sampleSheet, warehouseSheet, productSheet, docsSheet];
  allSheets.forEach((sheet) => {
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
    sheet.pageSetup.orientation = 'landscape';
    sheet.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
    
    // Print settings
    sheet.pageSetup.printArea = undefined;
    sheet.pageSetup.showGridLines = true;
    sheet.pageSetup.horizontalCentered = true;
  });

  // Save workbook
  const outputPath = path.join(__dirname, '..', '..', 'DyPOS', 'public', 'pos', 'assets', 'stock_import_export_template_v1.0.0.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Template generated: ${outputPath}`);
  console.log(`📊 Sheets: ${workbook.worksheets.map(s => s.name).join(', ')}`);
  console.log(`📁 Output: ${outputPath}`);
}

generateStockTemplate().catch(console.error);