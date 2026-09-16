import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const file = join(tmpdir(), `dypos_chk_${Date.now()}.db`);
const db = new DatabaseSync(file);

function t(label, fn) {
  try {
    console.log(`  ${label}: OK ->`, JSON.stringify(fn()));
  } catch (e) {
    console.log(`  ${label}: FAIL -> ${e.message}`);
  }
}

t('pragma exec WAL', () => {
  db.exec('PRAGMA journal_mode = WAL');
  return db.prepare('PRAGMA journal_mode').all();
});
t('pragma foreign_keys after exec', () => {
  db.exec('PRAGMA foreign_keys = ON');
  return db.prepare('PRAGMA foreign_keys').all();
});
t('pragma via prepare get', () => db.prepare('PRAGMA synchronous').all());

t('bind undefined', () => {
  db.exec('CREATE TABLE a(x TEXT)');
  return db.prepare('INSERT INTO a(x) VALUES (?)').run(undefined);
});
t('bind boolean', () => {
  db.exec('CREATE TABLE b(x INTEGER)');
  return db.prepare('INSERT INTO b(x) VALUES (?)').run(true);
});
t('bind Date', () => {
  db.exec('CREATE TABLE c(x TEXT)');
  try {
    return db.prepare('INSERT INTO c(x) VALUES (?)').run(new Date());
  } catch (e) {
    return `rejected: ${e.message}`;
  }
});
t('bind null', () => {
  db.exec('CREATE TABLE d(x TEXT)');
  return db.prepare('INSERT INTO d(x) VALUES (?)').run(null);
});
t('bind number non-finite', () => db.prepare('INSERT INTO d(x) VALUES (?)').run(NaN));

t('get on empty returns', () => db.prepare('SELECT * FROM d WHERE x = ?').get('nope'));
t('all returns array', () => db.prepare('SELECT * FROM d').all());

t('run returns meta', () => {
  db.exec('CREATE TABLE e(id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)');
  return db.prepare("INSERT INTO e(v) VALUES ('q')").run();
});
t('insert or replace', () => {
  db.exec('CREATE TABLE f(id TEXT PRIMARY KEY, v TEXT)');
  db.prepare('INSERT OR REPLACE INTO f(id,v) VALUES (?,?)').run('k', '1');
  db.prepare('INSERT OR REPLACE INTO f(id,v) VALUES (?,?)').run('k', '2');
  return db.prepare('SELECT * FROM f').all();
});
t('INSERT OR IGNORE', () => {
  db.exec('CREATE TABLE g(id TEXT PRIMARY KEY)');
  db.prepare('INSERT OR IGNORE INTO g(id) VALUES (?)').run('x');
  db.prepare('INSERT OR IGNORE INTO g(id) VALUES (?)').run('x');
  return db.prepare('SELECT COUNT(*) AS c FROM g').get();
});
t('foreign key enforcement', () => {
  db.exec('CREATE TABLE p(id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE ch(id TEXT PRIMARY KEY, p_id TEXT REFERENCES p(id))');
  try {
    db.prepare('INSERT INTO ch(id,p_id) VALUES (?,?)').run('c1', 'missing');
    return 'NOT ENFORCED';
  } catch (e) {
    return `enforced: ${e.message}`;
  }
});
t('manual BEGIN/COMMIT via exec', () => {
  db.exec('BEGIN');
  db.prepare("INSERT INTO g(id) VALUES ('tx1')").run();
  db.exec('COMMIT');
  return db.prepare('SELECT COUNT(*) AS c FROM g').get();
});
t('manual ROLLBACK via exec', () => {
  db.exec('BEGIN');
  db.prepare("INSERT INTO g(id) VALUES ('tx2')").run();
  db.exec('ROLLBACK');
  return db.prepare('SELECT COUNT(*) AS c FROM g').get();
});
t('SAVEPOINT nested', () => {
  db.exec('BEGIN');
  db.exec('SAVEPOINT sp1');
  db.prepare("INSERT INTO g(id) VALUES ('sp_a')").run();
  db.exec('ROLLBACK TO sp1');
  db.exec('RELEASE sp1');
  db.exec('COMMIT');
  return db.prepare('SELECT COUNT(*) AS c FROM g').get();
});
t('json text roundtrip', () => {
  db.exec('CREATE TABLE j(id TEXT PRIMARY KEY, payload TEXT)');
  db.prepare('INSERT INTO j(id,payload) VALUES (?,?)').run('a', JSON.stringify({ x: [1, 2] }));
  return JSON.parse(db.prepare('SELECT payload FROM j WHERE id=?').get('a').payload);
});
t('MAX(0, x) scalar', () => db.prepare('SELECT MAX(0, -5) AS v').get());
t('multi-statement exec', () => {
  db.exec('CREATE TABLE m1(a); CREATE TABLE m2(b); CREATE INDEX ix ON m1(a);');
  return 'ok';
});
t('named params colon', () => db.prepare('SELECT :v AS v').get({ v: 5 }));
t('named params dollar', () => db.prepare('SELECT $v AS v').get({ v: 6 }));
t('datetime + strftime', () => db.prepare("SELECT strftime('%Y-%m-%d','now') AS d, datetime('now') AS t").get());
t('long sql text', () => {
  const cols = Array.from({ length: 40 }, (_, i) => `c${i} TEXT`).join(',');
  db.exec(`CREATE TABLE big(${cols})`);
  return 'ok';
});
t('INTEGER PK rowid alias', () => {
  db.exec('CREATE TABLE k(id INTEGER PRIMARY KEY, v TEXT)');
  const r = db.prepare('INSERT INTO k(id,v) VALUES (?,?)').run(7, 'seven');
  return { r, row: db.prepare('SELECT * FROM k WHERE id=?').get(7) };
});
t('returning clause with get', () => {
  db.exec('CREATE TABLE n(id TEXT PRIMARY KEY, v TEXT)');
  return db.prepare('INSERT INTO n(id,v) VALUES (?,?) RETURNING *').get('z', 'zz');
});
t('aggregate SUM/COUNT', () => {
  db.exec('CREATE TABLE agg(v REAL)');
  const ins = db.prepare('INSERT INTO agg(v) VALUES (?)');
  ins.run(1.5);
  ins.run(2.5);
  return db.prepare('SELECT SUM(v) AS s, COUNT(*) AS c FROM agg').get();
});
t('timestamp real binding', () => db.prepare('SELECT ? AS v').get(1.23456789));

try {
  db.close();
  console.log('  close: OK');
} catch (e) {
  console.log('  close: FAIL ->', e.message);
}

rmSync(file, { force: true });
rmSync(`${file}-wal`, { force: true });
rmSync(`${file}-shm`, { force: true });