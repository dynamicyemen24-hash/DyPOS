import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE t(id TEXT PRIMARY KEY, b INTEGER, n REAL, s TEXT)");
const ins = db.prepare("INSERT INTO t(id,b,n,s) VALUES (?,?,?,?)");
// bool param
try { console.log("bool param:", JSON.stringify(ins.run("a", true, 1.5, "x"))); } catch (e) { console.log("bool param FAILED:", e.message); }
// undefined param
try { console.log("undef param:", JSON.stringify(ins.run("b", undefined, 1, "x"))); } catch (e) { console.log("undef param FAILED:", e.message); }
// null param
try { console.log("null param:", JSON.stringify(ins.run("c", null, 1, null))); } catch (e) { console.log("null param FAILED:", e.message); }
// number with decimals
try { console.log("float param:", JSON.stringify(ins.run("d", 1, 12.345, "y"))); } catch (e) { console.log("float FAILED:", e.message); }
// named params
try { const st = db.prepare("SELECT * FROM t WHERE id = :id"); console.log("named colon:", JSON.stringify(st.get({ id: "a" }))); } catch (e) { console.log("named colon FAILED:", e.message); }
try { const st = db.prepare("SELECT * FROM t WHERE id = $id"); console.log("named dollar:", JSON.stringify(st.get({ id: "a" }))); } catch (e) { console.log("named dollar FAILED:", e.message); }
// bigint / lastInsertRowid type
console.log("lastInsertRowid type:", typeof ins.run("e", 1, 1, "z").lastInsertRowid);
// WAL + pragma
try { db.exec("PRAGMA journal_mode = WAL"); console.log("WAL ok:", JSON.stringify(db.prepare("PRAGMA journal_mode").get())); } catch (e) { console.log("WAL FAILED:", e.message); }
try { db.exec("PRAGMA foreign_keys = ON"); console.log("FK ok"); } catch (e) { console.log("FK FAILED:", e.message); }
// multi-statement exec with comments (migration style)
try { db.exec("-- comment\nCREATE TABLE IF NOT EXISTS a(x TEXT);\nCREATE INDEX IF NOT EXISTS ix ON a(x);\nCREATE TABLE IF NOT EXISTS b(y TEXT);"); console.log("multistmt+comments ok"); } catch (e) { console.log("multistmt FAILED:", e.message); }
// ON CONFLICT DO UPDATE
try { db.exec("CREATE TABLE sl(pid TEXT, wid TEXT, qty REAL, PRIMARY KEY(pid,wid))"); db.prepare("INSERT INTO sl(pid,wid,qty) VALUES (?,?,?) ON CONFLICT(pid,wid) DO UPDATE SET qty=qty-?").run("p","w",10,3); console.log("upsert:", JSON.stringify(db.prepare("SELECT * FROM sl").get())); } catch (e) { console.log("upsert FAILED:", e.message); }
// datetime()
try { console.log("datetime:", JSON.stringify(db.prepare("SELECT datetime(\"now\") as now").get())); } catch (e) { console.log("datetime FAILED:", e.message); }
// GREATEST support?
try { console.log("GREATEST:", JSON.stringify(db.prepare("SELECT GREATEST(0, -5) as g").get())); } catch (e) { console.log("GREATEST NOT SUPPORTED:", e.message); }
// MAX scalar
try { console.log("MAX scalar:", JSON.stringify(db.prepare("SELECT MAX(0, -5) as g").get())); } catch (e) { console.log("MAX FAILED:", e.message); }
// manual transaction
try { db.exec("BEGIN"); ins.run("tx",1,1,"tx"); db.exec("COMMIT"); console.log("manual tx ok"); } catch (e) { console.log("manual tx FAILED:", e.message); }
try { db.exec("BEGIN"); ins.run("tx2",1,1,"tx2"); db.exec("ROLLBACK"); console.log("rollback ok, tx2 exists:", !!db.prepare("SELECT 1 FROM t WHERE id=?").get("tx2")); } catch (e) { console.log("rollback FAILED:", e.message); }
// close
db.close(); console.log("CLOSE OK");
