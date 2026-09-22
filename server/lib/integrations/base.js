/** DyPOS External Integration Unit — Base Adapter v1.31.0
 * Core POS never imports adapters directly. Adapters read via export/sync
 * models and subscribe via webhook outbox events only.
 */
export class BaseAdapter {
  constructor() {
    this.key = 'base';
    this.kind = 'generic';
    this.displayName = 'Base Adapter';
  }

  configSchema() {
    return { type: 'object', properties: {} };
  }

  async connect(_config) {
    return { ok: true, detail: 'base adapter: no external call' };
  }

  async pushInvoice(_invoiceId, _ctx) {
    throw Object.assign(new Error('pushInvoice not implemented for this adapter'), { statusCode: 501 });
  }

  async pullCatalog(_ctx) {
    return { products: [], count: 0 };
  }

  mapStatus(externalStatus) {
    const s = String(externalStatus || '').toUpperCase();
    if (['PAID', 'UNPAID', 'PARTIAL', 'RETURNED', 'VOIDED'].includes(s)) return s;
    return 'UNPAID';
  }
}

export default BaseAdapter;
