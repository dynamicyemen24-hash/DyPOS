/**
 * Installs a real IndexedDB implementation for the whole suite.
 *
 * jsdom ships no `indexedDB`, so the module Dexie resolves at import time is
 * absent and every Dexie-backed test fails with `MissingAPIError: IndexedDB API
 * missing` — during `db.open()`, before a single assertion runs. That is the
 * shape of the trap this file removes: the suite looked like it was testing the
 * offline store when in fact nothing had been exercised.
 *
 * `fake-indexeddb` is the WHATWG in-memory implementation, so the tests below
 * exercise Dexie's own query engine, indexes and transactions rather than a
 * hand-written table double. The transaction semantics the ledger relies on
 * (all-or-nothing writes across three tables) are Dexie's, so testing them
 * through a fake would assert the fake.
 *
 * It is dev-only: the shipped PWA gets IndexedDB from the browser.
 */
import "fake-indexeddb/auto"
