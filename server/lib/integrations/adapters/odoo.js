/** DyPOS Odoo Adapter (stub-safe) v1.31.0 */
import { BaseAdapter } from '../base.js';

export class OdooAdapter extends BaseAdapter {
  constructor() {
    super();
    this.key = 'odoo';
    this.kind = 'erp';
    this.displayName = 'Odoo';
  }

  configSchema() {
    return {
      type: 'object',
      required: ['base_url', 'db', 'username', 'api_key'],
      properties: {
        base_url: { type: 'string' },
        db: { type: 'string' },
        username: { type: 'string' },
        api_key: { type: 'string' },
      },
    };
  }

  async connect(config) {
    if (!config?.base_url || !config?.db) {
      throw Object.assign(new Error('Odoo: base_url + db required'), { statusCode: 400 });
    }
    return { ok: true, detail: 'Odoo config validated (no live call in stub)' };
  }
}

export default OdooAdapter;
