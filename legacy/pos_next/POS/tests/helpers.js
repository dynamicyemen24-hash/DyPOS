// Test helpers
function describe(name, fn) {
    console.log(`\n📦 ${name}`);
    if (fn) fn();
}

function it(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        global.passed++;
    } catch (e) {
        console.log(`  ❌ ${name}: ${e.message}`);
        global.failed++;
    }
}

function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`${msg || ''} Expected ${expected} but got ${actual}`);
    }
}

function assertTrue(condition, msg) {
    if (!condition) throw new Error(`${msg || ''} Condition is false`);
}

global.passed = 0;
global.failed = 0;
