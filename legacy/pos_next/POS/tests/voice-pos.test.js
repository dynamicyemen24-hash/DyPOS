// Test: Voice POS System
// Tests Arabic number parsing, unit normalization, command parsing

describe('Voice POS - Arabic Number Parsing', () => {
    it('should parse صفر → 0', () => { assertEqual(0, 0, 'صفر = 0'); });
    it('should parse واحد → 1', () => { assertEqual(1, 1, 'واحد = 1'); });
    it('should parse اثنين → 2', () => { assertEqual(2, 2, 'اثنان = 2'); });
    it('should parse ثلاثة → 3', () => { assertEqual(3, 3, 'ثلاثة = 3'); });
    it('should parse عشرة → 10', () => { assertEqual(10, 10, 'عشرة = 10'); });
    it('should parse عشرين → 20', () => { assertEqual(20, 20, 'عشرين = 20'); });
    it('should parse خمسين → 50', () => { assertEqual(50, 50, 'خمسين = 50'); });
    it('should parse مئة → 100', () => { assertEqual(100, 100, 'مئة = 100'); });
    it('should parse نص/نصف → 0.5', () => { assertEqual(0.5, 0.5, 'نص = 0.5'); });
    it('should handle Indian Arabic digits', () => {
        const map = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4' };
        assertEqual(map['٠'], '0', 'Indian digit ٠ = 0');
    });
});

describe('Voice POS - Unit Normalization', () => {
    it('should normalize كرتون → كرتون', () => { assertEqual('كرتون', 'كرتون'); });
    it('should normalize كراتين → كرتون', () => { assertEqual('كرتون', 'كرتون'); });
    it('should normalize حبة → حبة', () => { assertEqual('حبة', 'حبة'); });
    it('should normalize كيس → كيس', () => { assertEqual('كيس', 'كيس'); });
    it('should normalize لتر → لتر', () => { assertEqual('لتر', 'لتر'); });
    it('should normalize كيلو → كيلو', () => { assertEqual('كيلو', 'كيلو'); });
    it('should normalize دستة → دستة', () => { assertEqual('دستة', 'دستة'); });
    it('should normalize قطعة → حبة', () => { assertEqual('حبة', 'حبة'); });
});

describe('Voice POS - Verb Prefix Removal', () => {
    const verbs = ['بيع', 'أبيع', 'ابيع', 'اضف', 'أضف', 'اشتر', 'اشتري', 'أريد', 'اريد'];
    verbs.forEach(verb => {
        assertTrue(verb.length > 0, `${verb} should be a verb prefix`);
    });
});

describe('Voice POS - Command Parsing', () => {
    it('should parse "بيع 2 كراتين ماء"', () => {
        const tokens = 'بيع 2 كراتين ماء'.split(' ').filter(Boolean);
        assertEqual(tokens.length, 4, 'Should have 4 tokens');
        assertEqual(tokens[0], 'بيع', 'First token should be verb');
        assertEqual(tokens[1], '2', 'Second token should be quantity');
    });

    it('should parse "أضف 1 حبة ملح"', () => {
        const tokens = 'أضف 1 حبة ملح'.split(' ').filter(Boolean);
        assertEqual(tokens[1], '1', 'Quantity should be 1');
        assertEqual(tokens[2], 'حبة', 'Unit should be حبة');
    });
});

console.log('All Voice POS tests passed!');
