/** DyPOS Universal Multi-Device Hardware & Print Bridge v1.31.0 */
import db from '../db/schema.js'

/**
 * Initialize hardware peripherals and device configuration tables.
 */
export function initHardwareConfigTables() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS hardware_devices (
        id TEXT PRIMARY KEY,
        device_name TEXT,
        device_type TEXT, -- 'printer_thermal', 'barcode_scanner', 'cash_drawer', 'customer_display', 'scale'
        connection_type TEXT, -- 'qz_tray', 'webusb', 'bluetooth', 'network', 'browser_print'
        connection_target TEXT, -- IP address, port, or printer name
        is_default INTEGER DEFAULT 0,
        settings_json TEXT DEFAULT '{}',
        updated_at TEXT
      );
    `)

    // Seed default hardware profile if empty
    const count = db.prepare('SELECT COUNT(*) as c FROM hardware_devices').get()?.c || 0
    if (count === 0) {
      const defaultDevices = [
        ['dev-thermal-1', 'طابعة الإيصالات الحرارية الرئيسية', 'printer_thermal', 'qz_tray', 'POS-Printer-80', 1, '{"width":"80mm","auto_cutter":true}'],
        ['dev-drawer-1', 'درج النقود (Cash Drawer)', 'cash_drawer', 'qz_tray', 'POS-Printer-80', 1, '{"kick_pin":2}'],
        ['dev-scanner-1', 'قارئ الباركود (USB Scanner)', 'barcode_scanner', 'webusb', 'AUTO', 1, '{}'],
      ]
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO hardware_devices (id, device_name, device_type, connection_type, connection_target, is_default, settings_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      for (const dev of defaultDevices) {
        stmt.run(...dev)
      }
    }
  } catch (_e) {
    // Non-blocking best effort
  }
}

/**
 * Generate universal ESC/POS or HTML print payload for any device.
 * @param {Object} documentData - Invoice or report data
 * @param {Object} config - Print configuration and hardware device specs
 * @returns {Object} Formatted payload ready for QZ Tray or Web Print
 */
export function generateUniversalPrintPayload(documentData, config = {}) {
  const paperWidth = config.paper_size || '80mm'
  const isThermal = paperWidth === '80mm' || paperWidth === '58mm'

  return {
    format: isThermal ? 'ESC/POS' : 'HTML',
    paperWidth,
    title: documentData.title || 'مستند رسمي',
    headerText: config.header_text_ar || '',
    footerText: config.footer_text_ar || '',
    showLogo: !!config.show_logo,
    showTaxNumber: !!config.show_tax_number,
    showQrCode: !!config.show_qr_code,
    primaryColor: config.primary_color || '#0066CC',
    items: documentData.items || [],
    totals: documentData.totals || {},
    timestamp: documentData.timestamp || new Date().toISOString()
  }
}

export default {
  initHardwareConfigTables,
  generateUniversalPrintPayload,
}