const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('CREATE TABLE a(id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT, n REAL); CREATE INDEX ix ON a(v);');
const r1 = db.prepare('INSERT INTO a(v,n) VALUES (?,?)').run('x', 1.5);
console.log('run1 types:', typeof r1.changes, typeof r1.lastInsertRowid, String(r1.changes), String(r1.lastInsertRowid));
db.prepare('INSERT INTO a(v,n) VALUES (?,?)').run('y', 2);
console.log('get:', JSON.stringify(db.prepare('SELECT * FROM a WHERE v=?').get('x')));
console.log('get-missing:', db.prepare('SELECT * FROM a WHERE v=?').get('zzz'));
console.log('all:', JSON.stringify(db.prepare('SELECT * FROM a').all()));
try { console.log('GREATEST:', JSON.stringify(db.prepare('SELECT GREATEST(0, -5) as g').get())); } catch (e) { console.log('GREATEST FAILED:', e.message.slice(0, 80)); }
console.log('MAX:', JSON.stringify(db.prepare('SELECT MAX(0, -5) as g').get()));
db.exec('BEGIN'); db.prepare('INSERT INTO a(v,n) VALUES (?,?)').run('t', 3); db.exec('ROLLBACK');
console.log('after rollback:', JSON.stringify(db.prepare('SELECT COUNT(*) c FROM a').get()));
try { db.prepare('INSERT INTO a(v,n) VALUES (?,?)').run('b', true); console.log('bool accepted'); } catch (e) { console.log('bool rejected:', e.message.slice(0, 70)); }
try { db.prepare('INSERT INTO a(v,n) VALUES (?,?)').run('u', undefined); console.log('undef accepted'); } catch (e) { console.log('undef rejected:', e.message.slice(0, 70)); }
db.prepare('INSERT INTO a(v,n) VALUES (?,?)').run(null, null); console.log('null ok');
console.log('datetime:', JSON.stringify(db.prepare("SELECT datetime('now') d").get()));
db.exec('CREATE TABLE u(id TEXT PRIMARY KEY, k TEXT, n INTEGER)');
db.prepare('INSERT INTO u(id,k,n) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET n=excluded.n').run('1', 'a', 5);
db.prepare('INSERT INTO u(id,k,n) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET n=excluded.n').run('1', 'a', 9);
console.log('upsert:', JSON.stringify(db.prepare('SELECT * FROM u').all()));
console.log('INSERT OR IGNORE:', JSON.stringify(db.prepare('INSERT OR IGNORE INTO u(id,k,n) VALUES (?,?,?)').run('1', 'a', 100)));
console.log('no-params ok:', JSON.stringify(db.prepare('SELECT COUNT(*) c FROM a').get()));
console.log('close fn type:', typeof db.close);
db.close();
console.log('ALL API CHECKS PASSED');