/** DyPOS Universal Hardware & Print API Routes v1.31.0 */
import { Router } from 'express'
import db from '../db/schema.js'
import { v4 as uuid } from 'uuid'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { ah } from '../lib/async.js'
import { VERSION } from '../lib/version.js'
import { initHardwareConfigTables, generateUniversalPrintPayload } from '../lib/hardwareBridge.js'
import { getDocumentPrintConfig } from '../lib/printConfig.js'
import { initHardwareAuditTables, recordHardwareAudit } from '../lib/hardwareAudit.js'

const router = Router()

// Initialize hardware and audit tables
initHardwareConfigTables()
initHardwareAuditTables()

/**
 * GET /api/hardware/devices — Get all configured hardware peripherals
 */
router.get('/devices', authMiddleware, ah(async (req, res) => {
  let devices = []
  try {
    devices = db.prepare('SELECT * FROM hardware_devices').all()
  } catch {
    // fallback
  }
  return res.json({
    success: true,
    devices,
    version: VERSION
  })
}))

/**
 * POST /api/hardware/devices — Register or update a hardware peripheral (ADMIN only)
 */
router.post('/devices', authMiddleware, requireRole('ADMIN'), ah(async (req, res) => {
  const { device_name, device_type, connection_type, connection_target, is_default, settings_json } = req.body
  if (!device_name || !device_type || !connection_type) {
    return res.status(400).json({ error: 'اسم الجهاز ونوعه وطريقة الاتصال مطلوبة' })
  }

  const deviceId = uuid()
  try {
    db.prepare(`
      INSERT INTO hardware_devices (id, device_name, device_type, connection_type, connection_target, is_default, settings_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      deviceId,
      String(device_name).slice(0, 100),
      String(device_type).slice(0, 50),
      String(connection_type).slice(0, 50),
      String(connection_target || '').slice(0, 255),
      is_default ? 1 : 0,
      typeof settings_json === 'object' ? JSON.stringify(settings_json) : (settings_json || '{}')
    )
  } catch (e) {
    return res.status(400).json({ error: 'تعذر حفظ الجهاز: ' + e.message })
  }

  return res.status(201).json({
    success: true,
    message: 'تم تسجيل الجهاز بنجاح',
    deviceId,
    version: VERSION
  })
}))

/**
 * POST /api/hardware/print-job — Generate universal print payload for connected hardware with full audit
 */
router.post('/print-job', authMiddleware, ah(async (req, res) => {
  const { documentType = 'invoice', documentData, deviceId } = req.body
  if (!documentData) {
    return res.status(400).json({ error: 'بيانات المستند مطلوبة للطباعة' })
  }

  const config = getDocumentPrintConfig(documentType)
  const payload = generateUniversalPrintPayload(documentData, config)

  // Record audit trail for robustness & tracking
  recordHardwareAudit({
    deviceId: deviceId || 'default-printer',
    action: 'PRINT_JOB',
    status: 'SUCCESS',
    payloadSummary: `Doc: ${documentType}, Items: ${documentData.items?.length || 0}, Total: ${documentData.totals?.total || 0}`,
    username: req.user?.username
  })

  return res.json({
    success: true,
    message: 'تم توليد حزمة الطباعة المهيأة للأجهزة مع التدقيق بنجاح',
    payload,
    version: VERSION
  })
}))

export default router