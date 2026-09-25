/**
 * DyPOS Repository Base — generic Dexie table wrapper.
 *
 * UI and services must not touch Dexie directly; they go through the
 * repositories in this directory. The Dexie module is imported (and thus
 * mockable in tests exactly like `services/db` is mocked elsewhere).
 *
 * Atomicity: multi-table writes use `runTransaction()`, which maps to a
 * real Dexie `rw` transaction in production. Test fakes without
 * `transaction()` fall back to direct invocation (documented, not silent).
 */
import db from "@/services/db"

export function getDb() {
	return db
}

/**
 * Run `fn` inside a Dexie read-write transaction when available.
 * @param {string[]} tableNames
 * @param {Function} fn
 */
export async function runTransaction(tableNames, fn) {
	const database = getDb()
	if (database && typeof database.transaction === "function") {
		const tables = tableNames.map((name) => database.table(name))
		return database.transaction("rw", tables, fn)
	}
	return fn()
}

/**
 * Create a CRUD facade over one Dexie table.
 * @param {string} tableName
 */
export function createRepository(tableName) {
	const table = () => getDb().table(tableName)

	return {
		tableName,

		get(id) {
			return table().get(id)
		},

		put(record) {
			return table().put(record)
		},

		add(record) {
			return table().add(record)
		},

		update(id, patch) {
			return table().update(id, patch)
		},

		remove(id) {
			return table().delete(id)
		},

		all() {
			return table().toArray()
		},

		findBy(field, value) {
			return table().where(field).equals(value).toArray()
		},

		async findOneBy(field, value) {
			const rows = await table().where(field).equals(value).toArray()
			return rows[0] || null
		},

		async count() {
			const rows = await table().toArray()
			return rows.length
		},
	}
}
