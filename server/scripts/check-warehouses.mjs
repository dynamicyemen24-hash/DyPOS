import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('./data/dypos.db');
console.log(db.prepare("PRAGMA table_info(warehouses)").all());