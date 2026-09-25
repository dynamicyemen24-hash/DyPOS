import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./data/dypos.db');

console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name));
console.log('Migration version:', db.prepare("SELECT * FROM schema_version ORDER BY version DESC LIMIT 1").get());
console.log('Currencies:', db.prepare("SELECT code, name, symbol FROM currencies WHERE is_active=1").all());
console.log('Tenants:', db.prepare("SELECT id, name, code FROM tenants WHERE is_active=1").all());
console.log('Branches:', db.prepare("SELECT id, name, code FROM branches WHERE is_active=1").all());
console.log('Users:', db.prepare("SELECT username, full_name, role FROM users WHERE is_active=1").all());
console.log('Products:', db.prepare("SELECT COUNT(*) as c FROM products WHERE is_active=1").get());
console.log('Stock levels:', db.prepare("SELECT COUNT(*) as c FROM stock_levels WHERE qty > 0").get());