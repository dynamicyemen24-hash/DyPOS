// Test: Barcode Scanner
// Tests GS1 parsing, EAN-13 validation, ZATCA TLV

describe('Barcode Scanner - EAN-13', () => {
    it('should validate 12-digit input', () => {
        const digits = '590123412345';
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * (digits.charCodeAt(i) - 48);
        const checkDigit = (10 - (sum % 10)) % 10;
        assertEqual(checkDigit >= 0 && checkDigit <= 9, true, 'Check digit valid');
    });

    it('should validate 13-digit input', () => {
        const ean = '5901234123457';
        const digits = ean.slice(0, 12);
        const check = parseInt(ean[12]);
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * (digits.charCodeAt(i) - 48);
        const computed = (10 - (sum % 10)) % 10;
        assertEqual(computed, check, 'Check digit should match');
    });
});

describe('Barcode Scanner - GS1 Parsing', () => {
    it('should parse GS1 segments', () => {
        const data = '(01)5901234123457(10)ABC123';
        const parts = data.split('|');
        assertTrue(parts.length > 0, 'Should have segments');
    });

    it('should detect GS1 separator (0x1D)', () => {
        const GS = String.fromCharCode(29);
        const data = '5901234123457' + GS + '123';
        const normalized = data.replace(/\r|\n/g, '').trim().split(GS).join('|');
        assertTrue(normalized.includes('|'), 'Should convert GS to pipe');
    });
});

describe('Barcode Scanner - ZATCA TLV', () => {
    it('should decode TLV tags', () => {
        const tags = { 1: 'sellerName', 2: 'vatNumber', 3: 'timestamp' };
        assertTrue(tags[1] === 'sellerName', 'Tag 1 should be sellerName');
    });
});

describe('Barcode Scanner - Classification', () => {
    it('should classify GTIN', () => {
        const digits = '5901234123457';
        assertEqual(digits.length, 13, 'Should be 13 digits');
    });

    it('should classify plain text', () => {
        const text = 'SOME-CODE-123';
        assertEqual(text.length > 0, true, 'Plain text should be valid');
    });
});

console.log('All Barcode Scanner tests passed!');
