#!/usr/bin/env node
/**
 * DyPOS Server Entrypoint
 * Runs database migrations before starting the server.
 * In production, this ensures the schema is always up to date.
 */
import { migrate } from './db/schema.js';

console.log('[DyPOS] Running database migrations...');
try {
  migrate();
  console.log('[DyPOS] Migrations complete. Starting server...');
} catch (e) {
  console.error('[DyPOS FATAL] Migration failed:', e.message);
  process.exit(1);
}

// Import and start server
import('./server.js').catch((err) => {
  console.error('[DyPOS FATAL] Failed to start server:', err.message);
  process.exit(1);
});