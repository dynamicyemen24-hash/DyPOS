const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/dypos.db');

console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name));
console.log('Migration version:', db.prepare("SELECT * FROM schema_version ORDER BY version DESC LIMIT 1").get());
console.log('Currencies:', db.prepare('SELECT * FROM currencies').all());
console.log('UOMs:', db.prepare('SELECT * FROM uoms').all());
console.log('Tenants:', db.prepare('SELECT * FROM tenants').all());
console.log('Organizations:', db.prepare('SELECT * FROM organizations').all());
console.log('Branches:', db.prepare('SELECT * FROM branches').all());
console.log('Users:', db.prepare('SELECT * FROM users').all());
console.log('Products count:', db.prepare('SELECT COUNT(*) as c FROM products').get());
console.log('Customers count:', db.prepare('SELECT COUNT(*) as c FROM customers').get());