/**
 * DyPOS Validation — Zod + sanitization for enterprise input safety.
 * Protects against XSS, injection, oversized payloads, and malformed types.
 * Every route validates *before* touching DB — zero trust.
 */
import { z } from 'zod';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const result = schema.safeParse(data);
    if (!result.success) {
      const first = result.error.errors[0];
      return res.status(400).json({
        error: first?.message || 'بيانات غير صالحة',
        details: result.error.errors.map(e => ({ path: e.path.join('.'), message: e.message })).slice(0, 5),
      });
    }
    req[source] = result.data;
    next();
  };
}

// ── Common schemas ──
export const loginSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, 'اسم المستخدم يحتوي محارف غير مسموحة'),
  password: z.string().min(6).max(128),
});

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'كلمة المرور يجب أن تحتوي حرفًا ورقمًا'),
  fullName: z.string().trim().min(2).max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'AUDITOR']).optional().default('CASHIER'),
  tenantId: z.string().trim().max(64).optional(),
});

export const productSchema = z.object({
  code: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).optional(),
  barcode: z.string().trim().max(64).optional(),
  unitPrice: z.number().min(0).max(1_000_000).optional(),
  cost: z.number().min(0).max(1_000_000).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  uom: z.string().trim().max(20).optional(),
  category: z.string().trim().max(64).optional(),
  brand: z.string().trim().max(64).optional(),
  isActive: z.boolean().optional(),
  tenantId: z.string().trim().max(64).optional(),
});

// Partial update: every field optional (PUT requires full name).
export const productPatchSchema = productSchema.partial().extend({
  name: z.string().trim().min(1).max(200).optional(),
});

export const invoiceSchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1).max(64),
    qty: z.number().min(0.001).max(100000),
    unitPrice: z.number().min(0).max(1_000_000).optional(),
    discount: z.number().min(0).max(1_000_000).optional(),
    taxRate: z.number().min(0).max(100).optional(),
    uom: z.string().trim().max(20).optional(),
    warehouseId: z.string().trim().max(32).optional(),
  })).min(1).max(500),
  payments: z.array(z.object({
    method: z.string().trim().max(20),
    amount: z.number().min(0).max(10_000_000),
    reference: z.string().trim().max(128).optional(),
  })).max(10).optional(),
  customerId: z.string().trim().max(64).optional().nullable(),
  customerName: z.string().trim().max(200).optional(),
  warehouseId: z.string().trim().max(32).optional(),
  shiftId: z.string().trim().max(64).optional(),
  terminalId: z.string().trim().max(32).optional(),
  discountAmount: z.number().min(0).max(10_000_000).optional(),
  couponCode: z.string().trim().max(64).optional(),
  currency: z.string().trim().max(10).optional(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
  channelId: z.string().trim().max(64).optional(),
  tenantId: z.string().trim().max(64).optional(),
  orgId: z.string().trim().max(64).optional(),
  branchId: z.string().trim().max(64).optional(),
});

export const shiftOpenSchema = z.object({
  terminalId: z.string().trim().min(1).max(32),
  openingCash: z.number().min(0).max(1_000_000).optional(),
  tenantId: z.string().trim().max(64).optional(),
  branchId: z.string().trim().max(64).optional(),
});

export default { validate, loginSchema, registerSchema, productSchema, productPatchSchema, invoiceSchema, shiftOpenSchema };
