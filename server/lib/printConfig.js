/** DyPOS Print & Document Customization Engine v1.31.0 */
import db from '../db/schema.js'

/**
 * Initialize print templates and document properties table.
 */
export function initPrintConfigTables() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_print_configs (
        id TEXT PRIMARY KEY,
        document_type TEXT UNIQUE, -- 'invoice', 'report_eod', 'quotation', 'return_receipt'
        header_text_ar TEXT,
        footer_text_ar TEXT,
        show_logo INTEGER DEFAULT 1,
        show_tax_number INTEGER DEFAULT 1,
        show_qr_code INTEGER DEFAULT 1,
        paper_size TEXT DEFAULT '80mm', -- '80mm', '58mm', 'A4'
        font_family TEXT DEFAULT 'Cairo',
        primary_color TEXT DEFAULT '#0066CC',
        updated_at TEXT
      );
    `)

    // Seed default configuration if empty
    const count = db.prepare('SELECT COUNT(*) as c FROM document_print_configs').get()?.c || 0
    if (count === 0) {
      const defaultConfigs = [
        ['cfg-invoice', 'invoice', 'شكراً لتعاملكم معنا', 'الضريبة القيمة المضافة متضمنة', 1, 1, 1, '80mm', 'Cairo', '#0066CC'],
        ['cfg-eod', 'report_eod', 'تقرير إغلاق الوردية اليومي', 'نظام DyPOS المالي الذكي', 1, 0, 0, 'A4', 'Cairo', '#333333'],
      ]
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO document_print_configs (id, document_type, header_text_ar, footer_text_ar, show_logo, show_tax_number, show_qr_code, paper_size, font_family, primary_color, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      for (const cfg of defaultConfigs) {
        stmt.run(...cfg)
      }
    }
  } catch (e) {
    // Non-blocking best effort
  }
}

/**
 * Get document print configuration for a specific document type
 * @param {string} docType - Document type (invoice, report_eod, etc.)
 * @returns {Object} Configuration object
 */
export function getDocumentPrintConfig(docType = 'invoice') {
  try {
    const config = db.prepare('SELECT * FROM document_print_configs WHERE document_type=?').get(docType)
    if (config) return config
  } catch {
    // fallback
  }
  return {
    document_type: docType,
    header_text_ar: 'مؤسسة الأعمال الذكية',
    footer_text_ar: 'شكراً لزيارتكم',
    show_logo: 1,
    show_tax_number: 1,
    show_qr_code: 1,
    paper_size: '80mm',
    font_family: 'Cairo',
    primary_color: '#0066CC'
  }
}

export default {
  initPrintConfigTables,
  getDocumentPrintConfig,
}