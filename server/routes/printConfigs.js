/** DyPOS Print & Document Customization API Routes v1.31.0 */
import { Router } from 'express'
import db from '../db/schema.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { ah } from '../lib/async.js'
import { VERSION } from '../lib/version.js'
import { getDocumentPrintConfig, initPrintConfigTables } from '../lib/printConfig.js'

const router = Router()

// Initialize print config tables
initPrintConfigTables()

/**
 * GET /api/print-configs — Get all document printing properties
 */
router.get('/', authMiddleware, ah(async (req, res) => {
  let configs = []
  try {
    configs = db.prepare('SELECT * FROM document_print_configs').all()
  } catch {
    // fallback
  }
  return res.json({
    success: true,
    configs,
    version: VERSION
  })
}))

/**
 * PUT /api/print-configs/:docType — Update document printing properties (ADMIN only)
 */
router.put('/:docType', authMiddleware, requireRole('ADMIN'), ah(async (req, res) => {
  const docType = String(req.params.docType).slice(0, 32)
  const {
    header_text_ar,
    footer_text_ar,
    show_logo,
    show_tax_number,
    show_qr_code,
    paper_size,
    font_family,
    primary_color
  } = req.body

  try {
    db.prepare(`
      INSERT INTO document_print_configs (id, document_type, header_text_ar, footer_text_ar, show_logo, show_tax_number, show_qr_code, paper_size, font_family, primary_color, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(document_type) DO UPDATE SET
        header_text_ar=COALESCE(?, header_text_ar),
        footer_text_ar=COALESCE(?, footer_text_ar),
        show_logo=COALESCE(?, show_logo),
        show_tax_number=COALESCE(?, show_tax_number),
        show_qr_code=COALESCE(?, show_qr_code),
        paper_size=COALESCE(?, paper_size),
        font_family=COALESCE(?, font_family),
        primary_color=COALESCE(?, primary_color),
        updated_at=datetime('now')
    `).run(
      `cfg-${docType}`,
      docType,
      header_text_ar,
      footer_text_ar,
      show_logo != null ? Number(show_logo) : null,
      show_tax_number != null ? Number(show_tax_number) : null,
      show_qr_code != null ? Number(show_qr_code) : null,
      paper_size,
      font_family,
      primary_color,
      header_text_ar,
      footer_text_ar,
      show_logo != null ? Number(show_logo) : null,
      show_tax_number != null ? Number(show_tax_number) : null,
      show_qr_code != null ? Number(show_qr_code) : null,
      paper_size,
      font_family,
      primary_color
    )
  } catch (e) {
    return res.status(400).json({ error: 'تعذر حفظ إعدادات الطباعة: ' + e.message })
  }

  const updated = getDocumentPrintConfig(docType)
  return res.json({
    success: true,
    message: 'تم تحديث خصائص الطباعة والمستندات بنجاح',
    config: updated,
    version: VERSION
  })
}))

export default router