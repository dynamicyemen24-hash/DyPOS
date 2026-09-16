// One-off maintenance: drop the redundant db.close() wrapper from schema.js.
// The node:sqlite backed driver now implements close(callback) natively.
const fs = require('node:fs');
const path = 'db/schema.js';
let src = fs.readFileSync(path, 'utf8');

const wrapper =
  '// db.close() wrapper for graceful shutdown\r\n' +
  'db.close = function (callback) {\r\n' +
  '  if (callback) return Database.prototype.close.call(this, callback);\r\n' +
  '  return Database.prototype.close.call(this);\r\n' +
  '};\r\n\r\n';

if (!src.includes(wrapper)) {
  console.error('WRAPPER NOT FOUND — aborting');
  process.exit(1);
}
src = src.replace(wrapper, '');
fs.writeFileSync(path, src, 'utf8');
console.log('close() wrapper removed');
