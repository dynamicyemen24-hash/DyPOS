/**
 * Strict stock-guard bootstrap — imported BEFORE tests/setup.js so
 * DYPOS_STOCK_GUARD=strict is set before server.js module constants evaluate.
 * Usage: npm run test:stock-strict
 * (Separate --import file keeps the default suite on legacy policy.)
 */
process.env.DYPOS_STOCK_GUARD = 'strict';
