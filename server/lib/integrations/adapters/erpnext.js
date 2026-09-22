/** DyPOS ERPNext Adapter (stub-safe) v1.31.0 */
import { BaseAdapter } from '../base.js';

export class ErpnextAdapter extends BaseAdapter {
  constructor() {
    super();
    this.key = 'erpnext';
    this.kind = 'erp';
    this.displayName = 'ERPNext';
  }

  configSchema() {
    return {
      type: 'object',
      required: ['base_url', 'api_key', 'api_secret'],
      properties: {
        base_url: { type: 'string' },
        api_key: { type: 'string' },
        api_secret: { type: 'string' },
        company: { type: 'string' },
      },
    };
  }

  async connect(config) {
    if (!config?.base_url || !config?.api_key) {
      throw Object.assign(new Error('ERPNext: base_url + api_key required'), { statusCode: 400 });
    }
    return { ok: true, detail: 'ERPNext config validated (no live call in stub)' };
  }
}

export default ErpnextAdapter;
